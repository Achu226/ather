import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-test-'));
const { openStore } = await import('../src/main/store.js');
const { assistantTools } = await import('../src/main/tools/assistant.js');

const runner = (store) => (name, args = {}) => assistantTools.find((t) => t.name === name).run(args, { store });

test('preference survives a restart, then updates and deletes', () => {
  const file = join(process.env.ATHER_DATA, 'mem.db');
  let store = openStore(file);
  const saved = runner(store)('memory_save', { fact: 'Prefers short answers with examples', category: 'preference' });
  store.db.close();

  store = openStore(file); // "restart"
  const run = runner(store);
  const [m] = run('memory_list');
  assert.equal(m.id, saved.id);
  assert.equal(m.category, 'preference');

  run('memory_update', { id: m.id, fact: 'Prefers detailed answers with examples', category: 'preference' });
  assert.equal(run('memory_list')[0].fact, 'Prefers detailed answers with examples');

  run('memory_forget', { id: m.id });
  assert.equal(run('memory_list').length, 0);
});

test('refuses secrets and updates an overlapping older fact', () => {
  const run = runner(openStore(':memory:'));
  assert.ok(run('memory_save', { fact: 'My wifi password is hunter22' }).refused);
  assert.ok(run('memory_save', { fact: 'GitHub token ghp_abcdefghijklmnop1234' }).refused);
  assert.ok(run('memory_save', { fact: 'Card 4111 1111 1111 1111' }).refused);

  run('memory_save', { fact: 'DBMS exam on 14 December' });
  run('memory_save', { fact: 'DBMS exam on 16 December' });
  const list = run('memory_list');
  assert.equal(list.length, 1);
  assert.equal(list[0].fact, 'DBMS exam on 16 December');
});
