// Fires reminders and finishes focus timers. notify(title, body, kind) shows the alert.
import { localIso } from './calendar-feeds.js';
import { now } from '../store.js';
import { classesBetween } from '../tools/student.js';

const classAlerts = new Set(); // "start#id" of classes already announced

export function nextRepeat(at, repeat) {
  const d = new Date(at);
  do d.setDate(d.getDate() + (repeat === 'weekly' ? 7 : 1));
  while (repeat === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6));
  return localIso(d);
}

export function tick(store, notify) {
  const due = store.all('SELECT * FROM reminders WHERE deleted = 0 AND done = 0 AND at <= ?', `${localIso(new Date())}:59`);
  for (const r of due) {
    // Medicine and care: Maya waits for a spoken "done" (see careTick).
    if (r.care) notify('Medicine time', `${r.text}. Say done when you have finished.`, 'care', r.id);
    else notify('Reminder', r.text, 'reminder');
    if (r.repeat) store.run('UPDATE reminders SET at = ?, fired_at = ?, confirmed_at = NULL, escalated_at = NULL WHERE id = ?', nextRepeat(r.at, r.repeat), now(), r.id);
    else store.run('UPDATE reminders SET done = 1, fired_at = ?, confirmed_at = NULL, escalated_at = NULL WHERE id = ?', now(), r.id);
  }
  // A heads-up 10 minutes before each timetable class.
  const soon = localIso(new Date(Date.now() + 10 * 60_000));
  for (const c of classesBetween(store, soon.slice(0, 10), soon.slice(0, 10)).filter((x) => x.start === soon)) {
    const key = `${c.start}#${c.timetable_id}`;
    if (classAlerts.has(key)) continue;
    classAlerts.add(key);
    notify('Class in 10 minutes', `${c.title}${c.location ? ` in ${c.location}` : ''}`, 'reminder');
  }
  const focus = store.all('SELECT * FROM focus_sessions WHERE deleted = 0 AND ended_at IS NULL');
  for (const s of focus) {
    if (Date.now() - Date.parse(s.started_at) < s.minutes * 60_000) continue;
    store.run('UPDATE focus_sessions SET ended_at = ?, completed = 1 WHERE id = ?', now(), s.id);
    notify('Focus done', `${s.minutes} minutes of ${s.label}. Nice work! Take a short break.`, 'focus');
  }
}

/** A care reminder not confirmed within `wait` ms: caregivers get one quiet email (alert(reason) = sos.notify). */
export async function careTick(store, alert, wait = 15 * 60_000, at = Date.now()) {
  const late = store.all('SELECT * FROM reminders WHERE deleted = 0 AND care = 1 AND fired_at IS NOT NULL AND confirmed_at IS NULL AND escalated_at IS NULL AND fired_at <= ?',
    new Date(at - wait).toISOString());
  for (const r of late) {
    store.run('UPDATE reminders SET escalated_at = ? WHERE id = ?', now(), r.id);
    await alert(`has not confirmed a care reminder: "${r.text}" (due ${new Date(r.fired_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})`).catch(() => {});
  }
  return late.length;
}

export const careDone = (store, id) => store.run('UPDATE reminders SET confirmed_at = ? WHERE id = ? AND care = 1', now(), id);

export function startScheduler(store, notify) {
  const timer = setInterval(() => tick(store, notify), 15_000);
  tick(store, notify);
  return () => clearInterval(timer);
}
