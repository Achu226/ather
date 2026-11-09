// Managing the user's work: email follow-ups ("remind me if Rahul doesn't reply by Friday") and the Friday weekly report.
// Both live in settings, so they need no new tables.
import { now } from '../store.js';

const day = (d) => d.toLocaleDateString('en-CA');

export function addFollowUp(store, { from, subject = '', by }) {
  if (!from || !by || Number.isNaN(Date.parse(by))) throw new Error('A follow-up needs who (from) and a date (by).');
  const list = store.getSetting('followups', []);
  const item = { id: Date.now(), from, subject, by, created: now(), done: false };
  store.setSetting('followups', [...list, item]);
  return { following_up: item };
}

/**
 * For each open follow-up: a reply from that person since it was made → tell the user, done;
 * past its date with no reply → tell the user and add a task to chase it, done.
 */
export async function checkFollowUps({ store, mail, notify, at = new Date() }) {
  const list = store.getSetting('followups', []);
  const open = list.filter((f) => !f.done);
  if (!open.length || !store.getSetting('mail')) return [];
  const changed = [];
  for (const f of open) {
    const replies = await mail.search({ from: f.from, since: f.created.slice(0, 10) }, 1).catch(() => null);
    if (replies === null) continue; // offline: try again next time
    if (replies.length) {
      notify('They replied', `${f.from} replied${f.subject ? ` about ${f.subject}` : ''}: ${replies[0].subject}`, 'mail');
      Object.assign(f, { done: true, replied: true });
    } else if (at >= new Date(f.by)) {
      notify('No reply yet', `${f.from} has not replied${f.subject ? ` about ${f.subject}` : ''}. I added a task to follow up.`, 'mail');
      store.insert('tasks', { title: `Follow up with ${f.from}${f.subject ? `: ${f.subject}` : ''}`, due: day(at), priority: 'high', created_at: now() }, 'Follow-up task');
      Object.assign(f, { done: true, replied: false });
    } else continue;
    changed.push(f);
  }
  if (changed.length) store.setSetting('followups', list);
  return changed;
}

/** The week in Markdown: done, still open, coming up, focus time, follow-ups, emails waiting. */
export function weeklyMarkdown(store, end = new Date()) {
  const from = day(new Date(end - 7 * 864e5));
  const to = day(end);
  const next = day(new Date(+end + 7 * 864e5));
  const done = store.all('SELECT title, completed_at FROM tasks WHERE deleted = 0 AND done = 1 AND completed_at >= ? ORDER BY completed_at', from);
  const open = store.all('SELECT title, due FROM tasks WHERE deleted = 0 AND done = 0 ORDER BY due IS NULL, due');
  const events = store.all('SELECT title, start FROM events WHERE deleted = 0 AND start > ? AND start <= ? ORDER BY start', `${to}T23:59`, `${next}T23:59`);
  const focus = store.get('SELECT COALESCE(SUM(minutes), 0) AS m FROM focus_sessions WHERE deleted = 0 AND completed = 1 AND started_at >= ?', from).m;
  const follow = store.getSetting('followups', []).filter((f) => !f.done);
  const waiting = store.getSetting('mailTriage', null)?.needs_you || [];
  const apps = store.all('SELECT label, SUM(seconds) AS s FROM activity WHERE day > ? AND day <= ? GROUP BY label ORDER BY s DESC LIMIT 8', from, to);
  const hm = (s) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  const list = (rows, line, empty) => (rows.length ? rows.map((r) => `- ${line(r)}`).join('\n') : `- ${empty}`);
  return [
    `Week of ${from} to ${to}.`,
    `## Done (${done.length})`, list(done, (t) => `${t.title} (${t.completed_at.slice(0, 10)})`, 'Nothing marked done this week.'),
    `## Still open (${open.length})`, list(open, (t) => `${t.title}${t.due ? ` (due ${t.due.slice(0, 10)}${t.due.slice(0, 10) < to ? ', overdue' : ''})` : ''}`, 'No open tasks.'),
    '## Coming up next week', list(events, (e) => `${e.title} (${e.start.replace('T', ' ')})`, 'No events saved.'),
    '## Waiting on replies', list(follow, (f) => `${f.from}${f.subject ? `: ${f.subject}` : ''} (by ${f.by})`, 'No follow-ups.'),
    '## Emails that need you', list(waiting, (m) => `${m.from.split('<')[0].trim()}: ${m.subject}${m.why ? ` (${m.why})` : ''}`, 'None at the last inbox check.'),
    `## Focus time\n${focus} minutes of focus sessions.`,
    '## Time on the computer', list(apps, (a) => `${a.label}: ${hm(a.s)}`, 'Not tracked this week (Settings → Activity).'),
  ].join('\n\n');
}

export async function weeklyReport({ store, files, end = new Date() }) {
  const { path } = await files.document({ title: `Weekly report ${day(end)}`, markdown: weeklyMarkdown(store, end) });
  store.setSetting('weeklyReportLast', { at: now(), path, week: day(end) });
  return { path };
}

/** Fridays from 5 pm, once per Friday, unless switched off. */
export async function weeklyTick({ store, files, notify, at = new Date() }) {
  if (!store.getSetting('weeklyReport', true) || at.getDay() !== 5 || at.getHours() < 17) return null;
  if (store.getSetting('weeklyReportLast', null)?.week === day(at)) return null;
  const { path } = await weeklyReport({ store, files, end: at });
  notify('Weekly report ready', `Your week is summed up in ${path}`, 'report');
  return path;
}
