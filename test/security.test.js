import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-sec-'));
const { openStore } = await import('../src/main/store.js');
const { hashPin, verifyPin, createLock } = await import('../src/main/security.js');
const { createBackup, unpackBackup, applyBackup, autoBackup } = await import('../src/main/backup.js');
const { toIco } = await import('../scripts/make-icon.js');
const { dataDir } = await import('../src/main/paths.js');

test('PIN hashes verify and differ by salt', () => {
  const a = hashPin('4821'), b = hashPin('4821');
  assert.notEqual(a, b);
  assert.ok(verifyPin('4821', a));
  assert.ok(!verifyPin('4822', a));
  assert.ok(!verifyPin('4821', 'garbage'));
});

test('lock: set, lock, unlock, pause after 5 wrong tries, remove', () => {
  const store = openStore(':memory:');
  const changes = [];
  const lock = createLock({ store, onChange: (l) => changes.push(l) });
  assert.equal(lock.locked, false);
  assert.throws(() => lock.setPin('', '12'), /4 to 8 digits/);
  lock.setPin('', '2580');
  lock.lock();
  assert.equal(lock.locked, true);
  for (let i = 0; i < 5; i++) assert.equal(lock.unlock('0000').ok, false);
  assert.ok(lock.unlock('2580').wait > 0, 'should pause after 5 wrong PINs');
  assert.throws(() => lock.setPin('1111', null), /current PIN is wrong/);
  assert.deepEqual(changes, [true]);
});

test('idle locking respects the setting', () => {
  const store = openStore(':memory:');
  const lock = createLock({ store });
  lock.setPin('', '2580');
  store.setSetting('lockAfterMinutes', 5);
  lock.checkIdle(200);
  assert.equal(lock.locked, false);
  lock.checkIdle(301);
  assert.equal(lock.locked, true);
});

test('backup → restore round trip brings data back', () => {
  const store = openStore(join(dataDir, 'ather.db'));
  store.run("INSERT INTO tasks (title) VALUES ('Keep me')");
  const zip = createBackup(store, join(dataDir, 'backups'));
  assert.ok(existsSync(zip));
  store.run('DELETE FROM tasks');
  const dir = unpackBackup(zip);
  store.db.close();
  applyBackup(dir);
  const reopened = openStore(join(dataDir, 'ather.db'));
  assert.equal(reopened.get('SELECT title FROM tasks').title, 'Keep me');
  reopened.db.close();
});

test('restore refuses a zip that is not an Maya backup', () => {
  assert.throws(() => unpackBackup(join(process.cwd(), 'assets', 'icon.png')));
});

test('automatic backup runs weekly only', () => {
  const store = openStore(':memory:');
  const folder = join(dataDir, 'auto');
  assert.ok(autoBackup(store, folder));
  assert.equal(autoBackup(store, folder), null);
});

test('generated .ico files have a valid header', () => {
  const ico = readFileSync(join(process.cwd(), 'assets', 'icon-dark.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico.readUInt32LE(18), 22);
  assert.equal(ico.subarray(22, 26).toString('latin1'), '\x89PNG');
  assert.equal(toIco(Buffer.from('x')).length, 23);
});
