// "Your inbox, sorted": read, search, reply to and tidy emails over IMAP/SMTP, and let the brain pick what needs the user.
// Sending, moving and bulk changes are tools with confirm: true, so nothing leaves or moves without an approval card.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { OLLAMA } from '../ollama.js';
import { BRAIN_MODEL } from '../brain.js';
import { liteSwap } from '../models.js';

export const MAIL_PRESETS = {
  gmail: { host: 'imap.gmail.com', port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
};

// The IMAP account also sends: the matching SMTP servers.
const SMTP = { 'imap.gmail.com': 'smtp.gmail.com', 'outlook.office365.com': 'smtp.office365.com', 'imap.mail.yahoo.com': 'smtp.mail.yahoo.com' };
export const smtpHost = (imapHost) => SMTP[imapHost] || imapHost.replace(/^imap\./, 'smtp.');

/** The short form the brain and the Inbox page see (exported for tests). */
export function summary(uid, parsed, flags = new Set()) {
  return {
    uid,
    from: parsed.from?.text || '',
    subject: parsed.subject || '(no subject)',
    date: parsed.date?.toISOString(),
    unread: !flags.has('\\Seen'),
    snippet: (parsed.text || '').replace(/\s+/g, ' ').slice(0, 300),
    promo: !!parsed.headers?.get?.('list')?.unsubscribe,
  };
}

/** IMAP search criteria from the tool's plain arguments (exported for tests). */
export function criteria({ from, subject, text, since, unread } = {}) {
  const c = {};
  if (from) c.from = from;
  if (subject) c.subject = subject;
  if (text) c.body = text;
  if (since) c.since = new Date(since);
  if (unread) c.seen = false;
  return Object.keys(c).length ? c : { all: true };
}

/** imap / transport: tests pass fakes. */
export function createMail({ store, secrets, imap, transport }) {
  const account = () => {
    const cfg = store.getSetting('mail');
    const pass = secrets.get('mail-password');
    if (!cfg?.user || !pass) throw new Error('Email is not connected. Add it on the Inbox page.');
    return { ...cfg, pass };
  };

  async function withInbox(fn, folder = 'INBOX') {
    const cfg = account();
    const client = imap ? imap() : new ImapFlow({ host: cfg.host, port: cfg.port || 993, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try { return await fn(client); } finally { lock.release(); await client.logout(); }
  }

  // source fetches use BODY.PEEK, so looking does not mark anything read.
  async function fetchList(client, range, uid) {
    const mails = [];
    for await (const msg of client.fetch(range, { flags: true, source: true }, { uid })) mails.push(summary(msg.uid, await simpleParser(msg.source), msg.flags));
    return mails.reverse();
  }

  const recent = (limit = 15) => withInbox((client) => {
    const total = client.mailbox.exists;
    return total > 0 ? fetchList(client, `${Math.max(1, total - limit + 1)}:*`, false) : [];
  });

  /** Newest matching emails first. */
  const search = (query = {}, limit = 10) => withInbox(async (client) => {
    const uids = (await client.search(criteria(query), { uid: true })) || [];
    return uids.length ? fetchList(client, uids.slice(-limit), true) : [];
  });

  /** One whole email (text capped), with what a reply needs. */
  const read = (uid) => withInbox(async (client) => {
    const msg = await client.fetchOne(String(uid), { flags: true, source: true }, { uid: true });
    if (!msg) throw new Error(`No email with id ${uid}.`);
    const parsed = await simpleParser(msg.source);
    return { ...summary(msg.uid, parsed, msg.flags), to: parsed.to?.text || '', reply_to: parsed.replyTo?.text || parsed.from?.text || '',
      message_id: parsed.messageId, references: parsed.references, text: (parsed.text || '').slice(0, 4000),
      attachments: parsed.attachments.map((a) => a.filename).filter(Boolean) };
  });

  async function send({ to, subject, text, inReplyTo, references }) {
    const cfg = account();
    const mailer = transport || nodemailer.createTransport({ host: smtpHost(cfg.host), port: 465, secure: true, auth: { user: cfg.user, pass: cfg.pass } });
    const info = await mailer.sendMail({ from: cfg.user, to, subject, text, inReplyTo, references });
    return { sent: true, to, subject, id: info.messageId };
  }

  async function reply(uid, text) {
    const m = await read(uid);
    const refs = [m.references, m.message_id].flat().filter(Boolean);
    return send({ to: m.reply_to, subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`, text, inReplyTo: m.message_id, references: refs });
  }

  const ids = (uids) => [].concat(uids).map(String).join(',');
  const markRead = (uids) => withInbox(async (c) => { await c.messageFlagsAdd(ids(uids), ['\\Seen'], { uid: true }); return { marked_read: [].concat(uids).length }; });
  const folders = () => withInbox(async (c) => (await c.list()).map((f) => ({ path: f.path, use: f.specialUse || '' })));
  const move = (uids, folder) => withInbox(async (c) => { await c.messageMove(ids(uids), folder, { uid: true }); return { moved: [].concat(uids).length, to: folder }; });
  /** Archive = out of the inbox, never deleted (Gmail: All Mail). */
  async function archive(uids) {
    const list = await folders();
    const dest = list.find((f) => f.use === '\\Archive') || list.find((f) => f.use === '\\All');
    if (!dest) throw new Error('This mail account has no Archive folder.');
    return move(uids, dest.path);
  }
  /** Newsletters and ads (they carry List-Unsubscribe) among the recent emails. */
  const promotions = async (limit = 50) => (await recent(limit)).filter((m) => m.promo);

  /** Recent emails, each marked needs_you true/false with a short reason. */
  async function triage(limit = 15) {
    const mails = await recent(limit);
    if (!mails.length) return { mails: [], needs_you: 0 };
    const list = mails.map((m, i) => `${i}. From: ${m.from} | Subject: ${m.subject} | ${m.snippet.slice(0, 160)}`).join('\n');
    const res = await fetch(`${OLLAMA}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: liteSwap(BRAIN_MODEL), reasoning_effort: 'none', temperature: 0,
        messages: [{ role: 'user', content: `Which of these emails need the reader to act or reply (bills, deadlines, questions from real people, check-ins)? Newsletters, ads and notifications do not. Answer only JSON: [{"i":0,"needs_you":true,"why":"Due Friday"}] with "why" at most 5 words.\n\n${list}` }],
      }),
    });
    const content = (await res.json()).choices?.[0]?.message?.content || '[]';
    let marks = [];
    try { marks = JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] || '[]'); } catch { /* keep unmarked */ }
    for (const m of marks) if (mails[m.i]) Object.assign(mails[m.i], { needs_you: !!m.needs_you, why: m.why || '' });
    const result = { mails, needs_you: mails.filter((m) => m.needs_you).length };
    store.setSetting('mailTriage', { at: new Date().toISOString(), needs_you: result.mails.filter((m) => m.needs_you).map(({ uid, from, subject, why }) => ({ uid, from, subject, why })) });
    return result;
  }

  return { recent, search, read, send, reply, markRead, archive, move, folders, promotions, triage };
}
