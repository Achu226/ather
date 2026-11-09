// Backup / restore of the user's data (database + pictures; AI models are not included, they re-download).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dataDir, imagesDir, TAR } from './paths.js';

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

/** Writes Maya-backup-<date>.zip into `folder` and returns its path. */
export function createBackup(store, folder, { images = true } = {}) {
  mkdirSync(folder, { recursive: true });
  const staging = mkdtempSync(join(tmpdir(), 'ather-backup-'));
  try {
    // VACUUM INTO makes a consistent copy even while Maya is using the database.
    store.db.exec(`VACUUM INTO '${join(staging, 'ather.db').replace(/'/g, "''")}'`);
    if (images && existsSync(imagesDir)) cpSync(imagesDir, join(staging, 'images'), { recursive: true });
    const zip = join(folder, `Maya-backup-${stamp()}.zip`);
    execFileSync(TAR, ['-a', '-c', '-f', zip, '-C', staging, '.']);
    return zip;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Checks a backup zip and unpacks it to a temp folder; returns that folder. Throws if it is not an Maya backup. */
export function unpackBackup(zip) {
  const dir = mkdtempSync(join(tmpdir(), 'ather-restore-'));
  try { execFileSync(TAR, ['-x', '-f', zip, '-C', dir], { stdio: 'ignore' }); } catch { throw new Error('This file is not an Maya backup.'); }
  const db = join(dir, 'ather.db');
  if (!existsSync(db)) throw new Error('This file is not an Maya backup.');
  const check = new DatabaseSync(db, { readOnly: true });
  try {
    const tables = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
    if (!tables.includes('tasks') || !tables.includes('settings')) throw new Error('This backup is damaged or not from Maya.');
  } finally {
    check.close();
  }
  return dir;
}

/** Replace the live data with an unpacked backup. Call with the store closed, then restart the app. */
export function applyBackup(dir) {
  for (const f of ['ather.db-wal', 'ather.db-shm']) rmSync(join(dataDir, f), { force: true });
  cpSync(join(dir, 'ather.db'), join(dataDir, 'ather.db'));
  if (existsSync(join(dir, 'images'))) cpSync(join(dir, 'images'), imagesDir, { recursive: true });
  rmSync(dir, { recursive: true, force: true });
}

/** Weekly automatic backup into `folder`, keeping the newest `keep` of Maya's own backup files. */
export function autoBackup(store, folder, keep = 5) {
  const last = store.getSetting('lastAutoBackup', 0);
  if (!store.getSetting('autoBackup', true) || Date.now() - last < 7 * 864e5) return null;
  const zip = createBackup(store, folder, { images: false });
  store.setSetting('lastAutoBackup', Date.now());
  const old = readdirSync(folder).filter((f) => /^(?:Ather|Maya)-backup-[\d-]+\.zip$/.test(f))
    .map((f) => ({ f, t: statSync(join(folder, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(keep);
  for (const { f } of old) unlinkSync(join(folder, f));
  return zip;
}
