// Emergency SOS for people who may not be able to reach a phone: a short countdown (so a misheard word can be undone),
// then a loud alarm with a full-screen "I need help" sign, and an email to the caregivers saved on the Accessibility page.
// The optional check-in asks "Are you okay?" after a long silence and raises the alarm if nobody answers.
import nodemailer from 'nodemailer';

// The mail account connected in Inbox (IMAP) also sends: the matching SMTP servers.
const SMTP = { 'imap.gmail.com': 'smtp.gmail.com', 'outlook.office365.com': 'smtp.office365.com', 'imap.mail.yahoo.com': 'smtp.mail.yahoo.com' };
export const SOS_DEFAULTS = { contacts: [], phones: [], name: '', note: '', shareLocation: false, daily: { on: false, time: '20:00' }, checkin: { on: false, camera: false, hours: 3, from: '08:00', to: '22:00' }, medical: {} };

// Medical ID: what a caregiver or paramedic needs first. Shown on the help sign and sent with the SOS email.
export const MEDICAL_FIELDS = [['blood', 'Blood group'], ['allergies', 'Allergies'], ['conditions', 'Conditions'], ['medicines', 'Medicines'], ['doctor', 'Doctor']];
/** "Blood group: O+" lines for the fields that are filled in (exported for tests). */
export const medicalLines = (medical) => MEDICAL_FIELDS.filter(([k]) => String(medical?.[k] ?? '').trim()).map(([k, label]) => `${label}: ${String(medical[k]).trim()}`);

/** The email caregivers get (exported for tests). */
export function sosEmail({ name, note, reason, at, location, medical }) {
  const who = name || 'Your contact';
  const when = at.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return {
    subject: `SOS: ${who} needs help`,
    text: `${who} asked for help through Maya (${reason}) on ${when}.\n\n`
      + 'Please call or go to them now. An alarm is sounding on their computer and a "I need help" sign is on the screen.'
      + (location ? `\n\nApproximate location (from the internet connection, may be a few km off): ${location}` : '')
      + (note ? `\n\nNote from ${who}: ${note}` : '')
      + (medicalLines(medical).length ? `\n\nMedical ID:\n${medicalLines(medical).map((l) => `- ${l}`).join('\n')}` : '') + '\n\nSent automatically by Maya.',
  };
}

/** Rough location from the internet address, only when the user allowed it; null when offline. */
export async function approxLocation(fetchFn = fetch) {
  try {
    const j = await (await fetchFn('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })).json();
    if (!j.city) return null;
    return `${[j.city, j.region, j.country_name].filter(Boolean).join(', ')} — map: https://maps.google.com/?q=${j.latitude},${j.longitude}`;
  } catch { return null; }
}

/** The evening "I'm okay" email to caregivers (exported for tests). */
export function dailyEmail({ name, at, summary, care }) {
  const who = name || 'Your contact';
  const day = at.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const meds = care.length ? care.map((c) => `- ${c.text}: ${c.confirmed_at ? 'taken ✓' : c.fired_at ? 'NOT confirmed' : 'later today'}`).join('\n') : '- No medicine reminders today.';
  return {
    subject: `Daily update: ${who}, ${day}`,
    text: `Hello,\n\nThis is ${who}'s daily update from Maya.\n\nMedicines and care:\n${meds}\n\nToday: ${summary || 'Maya was not used much today.'}\n\nNo help was asked for. If anything looks wrong, please give ${who} a call.\n\nSent automatically by Maya.`,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const validPhone = (n) => /^\+?[0-9][0-9 ()-]{2,19}$/.test(String(n).trim());

/**
 * A phone call through Windows Phone Link (the user's paired phone): open tel:, then press its Call button.
 * pc is the PC helper; open(url) is shell.openExternal.
 */
export async function phoneCall({ pc, open, number, tries = 12 }) {
  if (!validPhone(number)) return { error: `"${number}" is not a phone number.` };
  const tel = String(number).replace(/[^0-9+]/g, '');
  await open(`tel:${tel}`);
  for (let i = 0; i < tries; i++) {
    await sleep(1000);
    const fg = await pc.foreground().catch(() => null);
    if (!/phone ?link|your ?phone|PhoneExperienceHost/i.test(`${fg?.process} ${fg?.title}`)) continue;
    const call = (await pc.elements().catch(() => [])).find((e) => /^(call|dial)\b/i.test(e.name || ''));
    if (call) { await pc.invoke(call.i); return { calling: tel }; }
  }
  return { error: 'Phone Link did not start the call. Pair your phone in the Phone Link app once.' };
}

/**
 * onState({ state: 'countdown' | 'alarm' | 'cancelled' | 'off', seconds, reason, sent, error }) drives the SOS window and the face.
 * transport: a nodemailer transport (tests pass a JSON one).
 */
export function createSos({ store, secrets, onState = () => {}, transport, call = null, countdownMs = 10_000, locate = approxLocation, alert = async () => 0 }) {
  let pending = null;
  const settings = () => ({ ...SOS_DEFAULTS, ...store.getSetting('sos', SOS_DEFAULTS) });
  // The SOS screen shows these even while Maya is PIN-locked, so they travel with each state.
  const who = () => ({ name: settings().name, note: settings().note, medical: medicalLines(settings().medical) });
  const log = (entry) => store.setSetting('sosLog', [{ at: new Date().toISOString(), ...entry }, ...store.getSetting('sosLog', [])].slice(0, 30));

  async function email(reason, { test = false, message = null } = {}) {
    const { contacts, name, note, shareLocation, medical } = settings();
    const msg = message || sosEmail({ name, note, reason, at: new Date(), location: shareLocation && !test ? await locate() : null, medical });
    const subject = test ? `Test: ${msg.subject}` : msg.subject;
    const text = test ? `This is only a test of Maya's emergency button. Nothing is wrong.\n\n---\n${msg.text}` : msg.text;
    // Telegram caregivers first and independently: it works even when no email account is connected.
    const telegram = await alert(`${subject}\n\n${text}`).catch(() => 0);
    if (!contacts.length) return { sent: 0, telegram, error: 'No caregiver email is saved (Accessibility page).' };
    const cfg = store.getSetting('mail');
    const pass = secrets.get('mail-password');
    if (!transport && (!cfg?.user || !pass)) return { sent: 0, telegram, error: 'Email is not connected (Inbox page), so no email could be sent.' };
    const mailer = transport || nodemailer.createTransport({ host: SMTP[cfg.host] || cfg.host.replace(/^imap\./, 'smtp.'), port: 465, secure: true, auth: { user: cfg.user, pass } });
    await mailer.sendMail({ from: cfg?.user || 'ather@localhost', to: contacts.join(', '), subject, text });
    return { sent: contacts.length, telegram };
  }

  async function fire() {
    const { reason } = pending;
    pending = null;
    onState({ state: 'alarm', reason, ...who() });
    // The call and the email go out together; the first saved phone number is called.
    const phone = settings().phones?.[0];
    const [result, rang] = await Promise.all([
      email(reason).catch((e) => ({ sent: 0, error: e.message })),
      phone && call ? call(phone).catch((e) => ({ error: e.message })) : { error: 'No emergency phone number is saved (Accessibility page).' },
    ]);
    Object.assign(result, { calling: rang.calling, call_error: rang.error });
    log({ event: 'alarm', reason, ...result });
    onState({ state: 'alarm', reason, ...who(), ...result });
    return result;
  }

  return {
    get pending() { return !!pending; },
    /** Starts the countdown; a check-in waits longer for an answer. */
    trigger(reason = 'asked for help', { ms = countdownMs } = {}) {
      if (pending) return { already: true };
      pending = { reason, timer: setTimeout(fire, ms) };
      onState({ state: 'countdown', seconds: Math.round(ms / 1000), reason, ...who() });
      return { countdown: Math.round(ms / 1000) };
    },
    cancel() {
      if (!pending) return false;
      clearTimeout(pending.timer);
      log({ event: 'cancelled', reason: pending.reason });
      pending = null;
      onState({ state: 'cancelled' });
      return true;
    },
    stopAlarm() { onState({ state: 'off' }); },
    test: () => email('test from the Accessibility page', { test: true }),
    testCall: () => (settings().phones?.[0] && call ? call(settings().phones[0]) : { error: 'Save a phone number first.' }),
    /** A quiet alert to caregivers (no alarm), e.g. a medicine not confirmed. */
    notify: (reason) => email(reason).then((r) => { log({ event: 'notice', reason, ...r }); return r; }),
    /** Once a day at the chosen time (if switched on): the "I'm okay" update. summary() and care() are read only when it is sent. */
    async dailyTick({ summary, care, at = new Date() }) {
      const { daily, name } = settings();
      const today = at.toLocaleDateString('en-CA');
      if (!daily?.on || at.toTimeString().slice(0, 5) < daily.time || store.getSetting('sosDailyLast', '') === today) return null;
      store.setSetting('sosDailyLast', today);
      const r = await email('daily update', { message: dailyEmail({ name, at, summary: summary(), care: care() }) }).catch((e) => ({ sent: 0, error: e.message }));
      log({ event: 'daily update', reason: 'evening update', ...r });
      return r;
    },
    settings,
    /** Call every minute: asks "Are you okay?" when the user has been silent for too long inside the set hours. */
    checkIn(idleSeconds, date = new Date()) {
      const { checkin } = settings();
      const hhmm = date.toTimeString().slice(0, 5);
      if (!checkin.on || pending || hhmm < checkin.from || hhmm > checkin.to || idleSeconds < checkin.hours * 3600) return false;
      this.trigger('did not answer an "are you okay?" check-in', { ms: 120_000 });
      return true;
    },
  };
}
