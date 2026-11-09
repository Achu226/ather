import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { dataDir } from './paths.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, notes TEXT, due TEXT,
  priority TEXT DEFAULT 'normal', done INTEGER DEFAULT 0, created_at TEXT, completed_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '',
  created_at TEXT, updated_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY, text TEXT NOT NULL, at TEXT NOT NULL, repeat TEXT,
  done INTEGER DEFAULT 0, fired_at TEXT, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY, name TEXT NOT NULL, per_week INTEGER DEFAULT 7,
  created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS habit_checkins (id INTEGER PRIMARY KEY, habit_id INTEGER NOT NULL, day TEXT NOT NULL,
  deleted INTEGER DEFAULT 0, UNIQUE(habit_id, day));
CREATE TABLE IF NOT EXISTS focus_sessions (id INTEGER PRIMARY KEY, label TEXT, minutes INTEGER NOT NULL,
  started_at TEXT, ended_at TEXT, completed INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, title TEXT NOT NULL, start TEXT NOT NULL, end TEXT,
  location TEXT, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS undo_log (id INTEGER PRIMARY KEY, label TEXT, tbl TEXT, row_id INTEGER, before TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS search_index (path TEXT PRIMARY KEY, kind TEXT, mtime REAL, text TEXT, embedding BLOB);
CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY, fact TEXT NOT NULL, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, conversation_id INTEGER, name TEXT, path TEXT, text TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS doc_chunks (id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, text TEXT, embedding BLOB);
CREATE TABLE IF NOT EXISTS study_sets (id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, items TEXT NOT NULL,
  created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS activity (day TEXT NOT NULL, hour INTEGER NOT NULL, app TEXT NOT NULL, label TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, hour, app, label));
CREATE TABLE IF NOT EXISTS routines (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, steps TEXT NOT NULL, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS lectures (id INTEGER PRIMARY KEY, title TEXT NOT NULL, source TEXT, started_at TEXT, minutes INTEGER DEFAULT 0,
  transcript TEXT DEFAULT '', notes TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY, provider TEXT, model TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS timetable (id INTEGER PRIMARY KEY, day TEXT NOT NULL, start TEXT NOT NULL, end TEXT, subject TEXT NOT NULL, room TEXT, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, relation TEXT, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS diary (id INTEGER PRIMARY KEY, text TEXT NOT NULL, mood TEXT, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS lists (id INTEGER PRIMARY KEY, list TEXT NOT NULL, item TEXT NOT NULL, done INTEGER DEFAULT 0, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY, subject TEXT NOT NULL, date TEXT NOT NULL, notes TEXT, created_at TEXT, deleted INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS workflow_runs (id INTEGER PRIMARY KEY, routine TEXT, trigger TEXT, status TEXT, steps TEXT, started_at TEXT, finished_at TEXT);
CREATE TABLE IF NOT EXISTS skills (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, "when" TEXT NOT NULL, steps TEXT NOT NULL, tools TEXT,
  enabled INTEGER DEFAULT 1, builtin INTEGER DEFAULT 0, uses INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS work_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, source TEXT, name TEXT NOT NULL, detail TEXT, status TEXT, ms INTEGER);
CREATE TABLE IF NOT EXISTS study_attempts (id INTEGER PRIMARY KEY, set_id INTEGER NOT NULL, score INTEGER, total INTEGER, created_at TEXT);
`;

// Columns added after the first release; ALTER TABLE has no IF NOT EXISTS.
const MIGRATIONS = [['messages', 'conversation_id', 'INTEGER'], ['messages', 'model', 'TEXT'], ['conversations', 'summary', 'TEXT'], ['messages', 'tools', 'TEXT'],
  ['memories', 'category', "TEXT DEFAULT 'fact'"], ['memories', 'updated_at', 'TEXT'],
  ['routines', 'schedule', "TEXT DEFAULT ''"], ['routines', 'last_scheduled', 'TEXT'],
  ['reminders', 'care', 'INTEGER DEFAULT 0'], ['reminders', 'confirmed_at', 'TEXT'], ['reminders', 'escalated_at', 'TEXT']];

// Tables the generic helpers below may touch; guards against SQL built from tool input.
const TABLES = new Set(['tasks', 'notes', 'reminders', 'habits', 'habit_checkins', 'focus_sessions', 'events', 'memories', 'study_sets', 'routines', 'timetable', 'exams', 'lists', 'contacts', 'diary', 'skills']);
const checkTable = (t) => { if (!TABLES.has(t)) throw new Error(`Unknown table ${t}`); return t; };

export const now = () => new Date().toISOString();

export function openStore(file = join(dataDir, 'ather.db')) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  for (const [table, column, type] of MIGRATIONS) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  const store = {
    db,
    all: (sql, ...args) => db.prepare(sql).all(...args),
    get: (sql, ...args) => db.prepare(sql).get(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),

    row: (table, id) => db.prepare(`SELECT * FROM ${checkTable(table)} WHERE id = ?`).get(id),

    /** Insert a row and remember how to undo it. Returns the new row. */
    insert(table, values, label) {
      const keys = Object.keys(values);
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO ${checkTable(table)} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      ).run(...keys.map((k) => values[k] ?? null));
      const id = Number(lastInsertRowid);
      store.remember(label, table, id, null);
      return store.row(table, id);
    },

    /** Update columns of one row, keeping the old row for undo. Returns the new row. */
    update(table, id, values, label) {
      const before = store.row(table, id);
      if (!before) throw new Error(`No ${table.replace(/s$/, '')} with id ${id}`);
      const keys = Object.keys(values).filter((k) => values[k] !== undefined);
      if (keys.length) {
        db.prepare(`UPDATE ${checkTable(table)} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`)
          .run(...keys.map((k) => values[k]), id);
      }
      store.remember(label, table, id, before);
      return store.row(table, id);
    },

    remember(label, table, id, before) {
      db.prepare('INSERT INTO undo_log (label, tbl, row_id, before, created_at) VALUES (?,?,?,?,?)')
        .run(label, table, id, before ? JSON.stringify(before) : null, now());
    },

    /** Undo the most recent change: delete a created row or restore the previous values. */
    undo() {
      const last = db.prepare('SELECT * FROM undo_log ORDER BY id DESC LIMIT 1').get();
      if (!last) return null;
      const table = checkTable(last.tbl);
      if (last.before === null) {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(last.row_id);
      } else {
        const before = JSON.parse(last.before);
        const keys = Object.keys(before).filter((k) => k !== 'id');
        db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`)
          .run(...keys.map((k) => before[k]), last.row_id);
      }
      db.prepare('DELETE FROM undo_log WHERE id = ?').run(last.id);
      return last.label;
    },

    getSetting(key, fallback = null) {
      const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return r ? JSON.parse(r.value) : fallback;
    },
    setSetting(key, value) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, JSON.stringify(value));
    },
  };
  return store;
}
