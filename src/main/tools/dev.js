// Built-in "MCP-style" capabilities: file manager, Git, SQLite, time, and approved commands.
// Every path must be inside the user's approved folders. ctx.services supplies trash (Recycle Bin).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { approvedFolders, userFolder } from '../services/mcp-presets.js';

const run = promisify(execFile);
const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const SECRET_FILE = /(^|[\\/])(\.env(\..*)?|id_rsa|id_ed25519|.*\.(pem|key|pfx|p12|kdbx)|credentials(\.json)?|secrets?\.(json|ya?ml)|passwords?\.(txt|csv))$/i;

/** Resolve a path and refuse anything outside the approved folders (no ../ escapes). Exported for tests. */
export function safePath(store, p) {
  if (!p) throw new Error('A path is needed.');
  const full = resolve(p);
  const ok = approvedFolders(store).some((root) => { const r = relative(resolve(root), full); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); });
  if (!ok) throw new Error(`"${full}" is outside your approved folders. Add the folder in Settings → Files to allow it.`);
  return full;
}

const TYPES = { Images: /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i, Documents: /\.(pdf|docx?|txt|md|rtf|odt|pptx?|xlsx?|csv)$/i, Videos: /\.(mp4|mkv|mov|avi|webm)$/i,
  Music: /\.(mp3|wav|flac|m4a|ogg)$/i, Archives: /\.(zip|rar|7z|tar|gz)$/i, Installers: /\.(exe|msi)$/i, Code: /\.(js|ts|py|java|c|cpp|html|css|json|ipynb)$/i };
const typeOf = (f) => Object.keys(TYPES).find((k) => TYPES[k].test(f)) || 'Other';

/** How far a timezone's wall clock is ahead of UTC at a given instant, in ms. */
function tzOffset(ms, tz) {
  const v = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - Math.floor(ms / 1000) * 1000;
}

const git = async (cwd, ...args) => (await run('git', args, { cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout;

/**
 * The newest finished file in Downloads (of a kind), waiting up to `wait` seconds for one still downloading
 * (.crdownload / .part). Exported for tests.
 */
export async function latestDownload({ kind = 'any', since = 0, wait = 0, dir = join(process.env.USERPROFILE || '', 'Downloads') } = {}) {
  const want = kind === 'any' ? /./ : TYPES[{ video: 'Videos', image: 'Images', photo: 'Images', document: 'Documents', music: 'Music' }[kind] || 'Other'] || /./;
  const end = Date.now() + wait * 1000;
  for (;;) {
    const files = readdirSync(dir).map((f) => ({ f, s: statSync(join(dir, f), { throwIfNoEntry: false }) })).filter(({ s }) => s?.isFile());
    const busy = files.some(({ f, s }) => /\.(crdownload|part|tmp)$/i.test(f) && s.mtimeMs >= since);
    const done = files.filter(({ f, s }) => want.test(f) && !/\.(crdownload|part|tmp)$/i.test(f) && s.mtimeMs >= since).sort((a, b) => b.s.mtimeMs - a.s.mtimeMs)[0];
    if (done && !busy) return { path: join(dir, done.f), name: done.f, bytes: done.s.size, saved: new Date(done.s.mtimeMs).toISOString() };
    if (Date.now() >= end) return busy ? { error: 'A download is still in progress.' } : { error: `No ${kind === 'any' ? '' : `${kind} `}file was downloaded${since ? ' just now' : ''}.` };
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export const devTools = [
  {
    name: 'downloads_latest', description: 'The newest file in the Downloads folder (e.g. a video just downloaded from WhatsApp or a website), to move or open it next. Set wait to wait for a download that has just started.',
    parameters: obj({ kind: { type: 'string', enum: ['any', 'video', 'image', 'document', 'music'] }, minutes: { type: 'integer', description: 'Only files from the last N minutes (default 10)' }, wait: { type: 'integer', description: 'Seconds to wait for it to finish, up to 120' } }),
    run: async ({ kind = 'any', minutes = 10, wait = 30 }) => ({ ...(await latestDownload({ kind, since: Date.now() - minutes * 60_000, wait: Math.min(120, wait), dir: userFolder('Downloads') })), desktop: userFolder('Desktop') }),
  },
  // ---------- file manager ----------
  {
    name: 'fs_list', description: 'List the files and folders in a folder (approved folders only), with sizes and dates.',
    parameters: obj({ path: str('Folder path') }, ['path']),
    run: ({ path }, { store }) => {
      const dir = safePath(store, path);
      return readdirSync(dir, { withFileTypes: true }).slice(0, 300).map((e) => {
        const s = statSync(join(dir, e.name), { throwIfNoEntry: false });
        return { name: e.name, folder: e.isDirectory(), kb: s && !e.isDirectory() ? Math.round(s.size / 1024) : undefined, modified: s?.mtime.toISOString().slice(0, 16) };
      });
    },
  },
  {
    name: 'fs_search', description: 'Find files by name (part of the name) inside an approved folder and its subfolders.',
    parameters: obj({ path: str('Folder to search'), name: str('Part of the file name') }, ['path', 'name']),
    run: ({ path, name }, { store }) => {
      const dir = safePath(store, path);
      const q = name.toLowerCase();
      return readdirSync(dir, { recursive: true }).filter((f) => basename(String(f)).toLowerCase().includes(q) && !/node_modules|\.git[\\/]/.test(f)).slice(0, 100).map((f) => join(dir, String(f)));
    },
  },
  {
    name: 'fs_read', description: 'Read a text or code file (approved folders only; secrets like .env or keys are never read).',
    parameters: obj({ path: str('File path') }, ['path']),
    run: ({ path }, { store }) => {
      const file = safePath(store, path);
      if (SECRET_FILE.test(file)) throw new Error('That file may contain passwords or keys, so Maya does not read it.');
      const text = readFileSync(file, 'utf8');
      return { path: file, text: text.slice(0, 20_000), truncated: text.length > 20_000 };
    },
  },
  {
    name: 'fs_write', description: 'Create or overwrite a text/code file in an approved folder. Overwriting asks the user first.',
    confirm: true,
    parameters: obj({ path: str('File path'), content: str('Full new file content') }, ['path', 'content']),
    run: ({ path, content }, { store }) => {
      const file = safePath(store, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
      return { written: file, bytes: Buffer.byteLength(content) };
    },
  },
  {
    name: 'fs_edit', description: 'Fix or change part of a code/text file: replace one exact piece of text (copied from fs_read) with new text. Best way to fix a bug. The user approves first.',
    confirm: true,
    parameters: obj({ path: str('File path'), find: str('The exact text now in the file (copy it from fs_read, including spaces)'), replace: str('The new text') }, ['path', 'find', 'replace']),
    run: ({ path, find, replace }, { store }) => {
      const file = safePath(store, path);
      if (SECRET_FILE.test(file)) throw new Error('That file may contain passwords or keys, so Maya does not change it.');
      const text = readFileSync(file, 'utf8');
      // Windows files often use \r\n while the model writes \n: match either.
      const at = (t) => text.split(t).length - 1;
      const target = at(find) ? find : at(find.replace(/\r?\n/g, '\r\n')) ? find.replace(/\r?\n/g, '\r\n') : null;
      if (!target) return { error: 'That exact text is not in the file. fs_read the file again and copy the text exactly.' };
      if (at(target) > 1) return { error: `That text appears ${at(target)} times; include more of the surrounding lines so it is unique.` };
      // Small models often put the whole corrected file in "replace": then it *is* the new file, not an insertion.
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const kept = lines.filter((l) => replace.includes(l)).length;
      if (lines.length >= 3 && kept / lines.length >= 0.7) { writeFileSync(file, text.includes('\r\n') ? replace.replace(/\r?\n/g, '\r\n') : replace); return { edited: file, rewrote_whole_file: true }; }
      writeFileSync(file, text.replace(target, () => (target.includes('\r\n') ? replace.replace(/\r?\n/g, '\r\n') : replace)));
      return { edited: file, replaced: target.length, with: replace.length };
    },
  },
  {
    name: 'fs_move', description: 'Move or rename a file or folder (both places must be in approved folders). Asks first.',
    confirm: true,
    parameters: obj({ from: str('Current path'), to: str('New path') }, ['from', 'to']),
    run: ({ from, to }, { store }) => {
      const a = safePath(store, from);
      // "Move it to the Desktop": into that folder, keeping the file's name.
      let b = safePath(store, to);
      if (statSync(b, { throwIfNoEntry: false })?.isDirectory() && !statSync(a).isDirectory()) b = join(b, basename(a));
      if (existsSync(b)) throw new Error(`"${b}" already exists; Maya never overwrites files when moving.`);
      mkdirSync(dirname(b), { recursive: true });
      renameSync(a, b);
      return { moved: a, to: b };
    },
  },
  {
    name: 'fs_trash', description: 'Delete a file or folder by moving it to the Recycle Bin (can be restored). Asks first.',
    confirm: true,
    parameters: obj({ path: str('Path to delete') }, ['path']),
    run: async ({ path }, { store, services }) => { const p = safePath(store, path); await services.trash(p); return { moved_to_recycle_bin: p }; },
  },
  {
    name: 'fs_organize', description: 'Tidy a folder (e.g. Downloads): move loose files into Images, Documents, Videos, Music, Archives, Installers, Code, Other subfolders. Asks first.',
    confirm: true,
    parameters: obj({ path: str('Folder to organise') }, ['path']),
    run: ({ path }, { store }) => {
      const dir = safePath(store, path);
      const moved = {};
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (!e.isFile() || e.name.startsWith('.')) continue;
        const type = typeOf(e.name);
        let target = join(dir, type, e.name);
        for (let i = 2; existsSync(target); i++) target = join(dir, type, `${basename(e.name, extname(e.name))} (${i})${extname(e.name)}`);
        mkdirSync(join(dir, type), { recursive: true });
        renameSync(join(dir, e.name), target);
        moved[type] = (moved[type] || 0) + 1;
      }
      return { folder: dir, moved };
    },
  },

  // ---------- Git (read-only except commit) ----------
  {
    name: 'git_status', description: 'Git status of a project folder: branch, changed, staged and untracked files.',
    parameters: obj({ path: str('Project folder') }, ['path']),
    run: async ({ path }, { store }) => ({ status: await git(safePath(store, path), 'status', '--short', '--branch') }),
  },
  {
    name: 'git_diff', description: 'The current uncommitted changes (diff) of a project, to review or explain them.',
    parameters: obj({ path: str('Project folder'), staged: { type: 'boolean' } }, ['path']),
    run: async ({ path, staged }, { store }) => { const d = await git(safePath(store, path), 'diff', ...(staged ? ['--staged'] : []), '--stat', '-p'); return { diff: d.slice(0, 15_000), truncated: d.length > 15_000 }; },
  },
  {
    name: 'git_log', description: 'Recent commits of a project (who, when, message).',
    parameters: obj({ path: str('Project folder'), count: { type: 'integer' } }, ['path']),
    run: async ({ path, count = 15 }, { store }) => ({ log: await git(safePath(store, path), 'log', `-${Math.min(count, 50)}`, '--date=short', '--pretty=format:%h %ad %an: %s') }),
  },
  {
    name: 'git_branches', description: 'List the branches of a project.',
    parameters: obj({ path: str('Project folder') }, ['path']),
    run: async ({ path }, { store }) => ({ branches: await git(safePath(store, path), 'branch', '-a') }),
  },
  {
    name: 'git_commit', description: 'Commit ALL current changes of a project with a message. Asks first. Never pushes.',
    confirm: true,
    parameters: obj({ path: str('Project folder'), message: str('Commit message') }, ['path', 'message']),
    run: async ({ path, message }, { store }) => { const cwd = safePath(store, path); await git(cwd, 'add', '-A'); return { committed: (await git(cwd, 'commit', '-m', message)).split('\n')[0] }; },
  },
  {
    name: 'git_init', description: 'Start Git version control in a project folder (approved folders only). Does nothing if it already has Git.',
    parameters: obj({ path: str('Project folder') }, ['path']),
    run: async ({ path }, { store }) => {
      const cwd = safePath(store, path);
      if (existsSync(join(cwd, '.git'))) return { already: true };
      await git(cwd, 'init', '-b', 'main');
      return { initialised: cwd };
    },
  },
  {
    name: 'github_publish',
    description: 'DevOps: create a NEW public GitHub repository from a committed project folder, push it, and optionally turn on GitHub Pages so the website is live. Only when the user asked to publish or deploy. Asks first.',
    confirm: true,
    parameters: obj({ path: str('Project folder'), name: str('Repository name, e.g. "portfolio-site"'), pages: { type: 'boolean', description: 'Host index.html with GitHub Pages' } }, ['path', 'name']),
    run: async ({ path, name, pages = true }, { store }) => {
      const cwd = safePath(store, path);
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) return { error: 'Repository names may use letters, numbers, dot, dash and underscore.' };
      const gh = (...args) => run('gh', args, { cwd, windowsHide: true, timeout: 120_000 }).then((r) => r.stdout.trim());
      const owner = await gh('api', 'user', '--jq', '.login').catch(() => null);
      if (!owner) return { error: 'The GitHub CLI is not signed in. Run "gh auth login" once, then try again.' };
      await gh('repo', 'create', name, '--public', '--source', '.', '--push');
      const out = { repo: `https://github.com/${owner}/${name}` };
      if (pages) {
        await gh('api', '-X', 'POST', `repos/${owner}/${name}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/').catch(() => {});
        out.website = `https://${owner.toLowerCase()}.github.io/${name}/`;
        out.note = 'GitHub Pages takes about a minute to go live.';
      }
      return out;
    },
  },
  {
    name: 'qa_check_site', description: 'QA: open a website project (its index.html) in a hidden browser and report errors, missing images, empty page, title and a screenshot. Run after every change; fix what it finds.',
    parameters: obj({ path: str('Project folder'), page: str('Page file, default index.html') }, ['path']),
    run: ({ path, page }, { store, services }) => services.qa.checkSite(safePath(store, path), page),
  },

  // ---------- SQLite (read-only unless approved) ----------
  {
    name: 'db_schema', description: 'Tables and columns of a SQLite database file (approved folders only).',
    parameters: obj({ path: str('Path to .db/.sqlite file') }, ['path']),
    run: ({ path }, { store }) => {
      const db = new DatabaseSync(safePath(store, path), { readOnly: true });
      try {
        return db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").all();
      } finally { db.close(); }
    },
  },
  {
    name: 'db_query', description: 'Run a read-only SQL query (SELECT) on a SQLite database file and return up to 200 rows.',
    parameters: obj({ path: str('Database file'), sql: str('SELECT query'), params: { type: 'array', items: {}, description: 'Values for ? placeholders' } }, ['path', 'sql']),
    run: ({ path, sql, params = [] }, { store }) => {
      // The connection itself is read-only, so even a sneaky UPDATE fails.
      const db = new DatabaseSync(safePath(store, path), { readOnly: true });
      try {
        const rows = db.prepare(sql).all(...params);
        return { rows: rows.slice(0, 200), count: rows.length };
      } finally { db.close(); }
    },
  },
  {
    name: 'db_execute', description: 'Change a SQLite database (INSERT/UPDATE/DELETE/CREATE). Asks first.',
    confirm: true,
    parameters: obj({ path: str('Database file'), sql: str('SQL statement'), params: { type: 'array', items: {} } }, ['path', 'sql']),
    run: ({ path, sql, params = [] }, { store }) => {
      const db = new DatabaseSync(safePath(store, path));
      try { const r = db.prepare(sql).run(...params); return { changes: Number(r.changes) }; } finally { db.close(); }
    },
  },

  // ---------- time ----------
  {
    name: 'time_now', description: 'The exact current date and time, in the user\'s timezone or another one (e.g. "America/New_York", "Asia/Tokyo").',
    parameters: obj({ timezone: str('IANA timezone, optional') }),
    run: ({ timezone }) => {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      return { timezone: tz, now: new Date().toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }) };
    },
  },
  {
    name: 'time_convert', description: 'Convert a date-time from one timezone to another.',
    parameters: obj({ datetime: str('e.g. 2026-11-02T18:30'), from: str('IANA timezone of that time'), to: str('Target IANA timezone') }, ['datetime', 'from', 'to']),
    run: ({ datetime, from, to }) => {
      // Find the UTC instant whose wall-clock time in `from` equals `datetime`; the second pass handles daylight saving.
      const guess = Date.parse(`${datetime.length === 16 ? `${datetime}:00` : datetime}Z`);
      let instant = guess - tzOffset(guess, from);
      instant = guess - tzOffset(instant, from);
      instant = new Date(instant);
      return { [from]: datetime, [to]: instant.toLocaleString('en-GB', { timeZone: to, dateStyle: 'medium', timeStyle: 'short' }), utc: instant.toISOString() };
    },
  },
  {
    name: 'time_until', description: 'How long until (or since) a date-time: days, hours, minutes. Use for deadlines and countdowns.',
    parameters: obj({ datetime: str('Local ISO date-time, e.g. 2026-12-14T09:00') }, ['datetime']),
    run: ({ datetime }) => {
      const ms = new Date(datetime) - Date.now();
      const abs = Math.abs(ms);
      return { past: ms < 0, days: Math.floor(abs / 864e5), hours: Math.floor((abs % 864e5) / 36e5), minutes: Math.floor((abs % 36e5) / 6e4) };
    },
  },

  // ---------- commands (coding engineer) ----------
  {
    name: 'run_command', description: 'Run a command in a project folder (e.g. "npm test", "python main.py", "git status") and return its output. Always asks first. 2 minute limit. Never use it to read or change files (no type, echo >, sed, Set-Content): use fs_read, fs_edit and fs_write.',
    confirm: true,
    parameters: obj({ command: str('The command line'), cwd: str('Project folder') }, ['command', 'cwd']),
    run: async ({ command, cwd }, { store }) => {
      const dir = safePath(store, cwd);
      try {
        const { stdout, stderr } = await run('cmd.exe', ['/d', '/s', '/c', command], { cwd: dir, timeout: 120_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
        return { exit_code: 0, stdout: stdout.slice(-8000), stderr: stderr.slice(-4000) };
      } catch (e) {
        return { exit_code: e.code ?? 1, stdout: (e.stdout || '').slice(-8000), stderr: (e.stderr || e.message).slice(-4000), timed_out: !!e.killed };
      }
    },
  },
];
