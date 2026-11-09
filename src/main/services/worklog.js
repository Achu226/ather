// The work monitor: every action Maya takes, in plain words ("Wrote app.js", "Sent an email to Rahul"),
// kept 30 days on this PC. The Monitor page shows it live; "what are you doing?" reads it out.
import { now } from '../store.js';

const KEEP_DAYS = 30;
const short = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const file = (p) => String(p || '').split(/[\\/]/).pop();

/** One action in everyday words (exported for tests). */
export function describe(name, args = {}, result = {}) {
  const r = result || {};
  const failed = r.error ? ` — failed: ${short(r.error, 60)}` : r.denied ? ' — you said no' : '';
  const said = {
    fs_write: () => `Wrote ${file(args.path)}`,
    fs_read: () => `Read ${file(args.path)}`,
    run_command: () => `Ran “${short(args.command, 50)}”${r.exit_code !== undefined ? ` (exit ${r.exit_code})` : ''}`,
    python_run: () => 'Ran Python code',
    web_search: () => `Searched the web for “${short(args.query, 50)}”`,
    web_read: () => `Read a web page`,
    mail_send: () => `Sent an email to ${args.to}`,
    mail_reply: () => 'Replied to an email',
    mail_search: () => 'Searched your email',
    files_make_document: () => `Made the document “${short(args.title, 40)}”`,
    files_make_presentation: () => `Made the slides “${short(args.title, 40)}”`,
    tasks_create: () => `Added the task “${short(args.title, 50)}”`,
    reminders_create: () => `Set a reminder: ${short(args.text, 50)}`,
    computer_type: () => 'Typed on the screen',
    computer_click: () => 'Clicked on the screen',
    computer_open: () => `Opened ${args.name || args.app || 'an app'}`,
    pc_open_app: () => `Opened ${args.name}`,
    pc_power: () => `Asked to ${args.action} the PC`,
    qa_check_site: () => `Checked the website${r.errors?.length ? ` — ${r.errors.length} problem(s)` : ''}`,
    git_commit: () => `Saved a Git commit: ${short(args.message, 40)}`,
    agent_plan: () => `Made a plan with ${args.steps?.length || 0} steps`,
    skills_save: () => `Learned the skill “${args.name}”`,
  }[name];
  const first = Object.values(args).find((v) => typeof v === 'string');
  return (said ? said() : `${name.replace(/_/g, ' ')}${first ? `: ${short(first, 50)}` : ''}`) + failed;
}

export function logWork(store, { source = 'chat', name, args, result, ms = 0 }) {
  const status = result?.error ? 'failed' : result?.denied ? 'denied' : 'done';
  const { lastInsertRowid } = store.run('INSERT INTO work_log (at, source, name, detail, status, ms) VALUES (?,?,?,?,?,?)', now(), source, name, describe(name, args, result), status, Math.round(ms));
  // Old entries go now and then, not on every write.
  if (Number(lastInsertRowid) % 200 === 0) store.run('DELETE FROM work_log WHERE at < ?', new Date(Date.now() - KEEP_DAYS * 864e5).toISOString());
}

/** Today's work, newest first, with totals: what "what are you doing / what did you do today?" reads. */
export function workToday(store, limit = 50) {
  const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const items = store.all('SELECT * FROM work_log WHERE at >= ? ORDER BY id DESC LIMIT ?', since, limit);
  const totals = store.get("SELECT COUNT(*) AS actions, SUM(status = 'failed') AS failed, COALESCE(SUM(ms), 0) AS ms FROM work_log WHERE at >= ?", since);
  return { now: items[0] && Date.now() - Date.parse(items[0].at) < 15_000 ? items[0].detail : null, actions: totals.actions, failed: totals.failed || 0, minutes: Math.round(totals.ms / 60000), items };
}
