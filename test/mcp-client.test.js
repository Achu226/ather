// Real MCP servers: each must connect, list tools AND run a tool. Needs internet + Node (npx) the first time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-mcpc-'));
process.env.ATHER_MODELS = join(process.env.APPDATA, 'Ather', 'models');
const { openStore } = await import('../src/main/store.js');
const { createMcpClient, toolName, isReadTool } = await import('../src/main/services/mcp-client.js');
const { MCP_PRESETS, resolveEnv, GH } = await import('../src/main/services/mcp-presets.js');
const { devTools, safePath } = await import('../src/main/tools/dev.js');

const work = mkdtempSync(join(tmpdir(), 'ather-approved-'));
const store = openStore(':memory:');
store.setSetting('approvedFolders', [work]);
const mcp = createMcpClient({ store, presets: MCP_PRESETS, resolveEnv });
const long = { timeout: 240_000 };
const dev = (name, args) => devTools.find((t) => t.name === name).run(args, { store, services: { trash: async () => {} } });

test('tool names and read-only detection', () => {
  assert.equal(toolName('github', 'search_code'), 'mcp_github_search_code');
  assert.equal(toolName('my-server', 'Do.Thing'), 'mcp_my_server_do_thing');
  assert.ok(isReadTool('list_directory') && isReadTool('browser_snapshot') && !isReadTool('write_file') && !isReadTool('browser_click'));
});

test('filesystem server: connects, lists tools, reads only the approved folder', long, async () => {
  writeFileSync(join(work, 'hello.txt'), 'hello from ather');
  const s = await mcp.connect('filesystem');
  assert.equal(s.status, 'connected', s.error);
  assert.ok(s.tools.some((t) => t.name === 'read_text_file' || t.name === 'read_file'));
  const r = await mcp.call('filesystem', 'list_directory', { path: work });
  assert.match(r.content, /hello\.txt/);
  const outside = await mcp.call('filesystem', 'list_directory', { path: 'C:\\Windows' });
  assert.ok(outside.isError, 'must refuse folders that are not approved');
});

test('context7 docs server: real documentation lookup', long, async () => {
  const s = await mcp.connect('context7');
  assert.equal(s.status, 'connected', s.error);
  const resolveTool = s.tools.find((t) => /resolve/i.test(t.name)).name;
  const r = await mcp.call('context7', resolveTool, { libraryName: 'react', query: 'react hooks' });
  assert.match(r.content, /react/i);
});

test('sequential thinking server runs a step', long, async () => {
  const s = await mcp.connect('thinking');
  assert.equal(s.status, 'connected', s.error);
  const r = await mcp.call('thinking', s.tools[0].name, { thought: 'Step one: list the exams.', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true });
  assert.ok(!r.isError, r.content);
});

test('playwright browser server opens a page', long, async () => {
  const s = await mcp.connect('playwright');
  assert.equal(s.status, 'connected', s.error);
  const r = await mcp.call('playwright', 'browser_navigate', { url: 'https://example.com' });
  assert.match(r.content, /Example Domain/i);
  await mcp.call('playwright', 'browser_close', {}).catch(() => {});
});

test('github server uses the GitHub CLI sign-in', { ...long, skip: !existsSync(GH) && 'GitHub CLI not installed' }, async () => {
  const s = await mcp.connect('github');
  assert.equal(s.status, 'connected', s.error);
  const r = await mcp.call('github', 'get_me', {});
  assert.match(r.content, /Achu226/i);
  // Writes need approval: the github server's permission is "ask".
  mcp.save('github', { enabled: true });
  assert.ok(mcp.tools().filter((t) => t.mcp === 'github').every((t) => t.confirm));
});

test('built-in file manager stays inside approved folders', () => {
  assert.throws(() => safePath(store, 'C:\\Windows\\system.ini'), /outside your approved folders/);
  assert.throws(() => safePath(store, join(work, '..', '..', 'secret.txt')), /outside/);
  writeFileSync(join(work, '.env'), 'KEY=1');
  assert.throws(() => dev('fs_read', { path: join(work, '.env') }), /passwords or keys/);
  writeFileSync(join(work, 'photo.jpg'), 'x'); writeFileSync(join(work, 'notes.pdf'), 'x');
  const r = dev('fs_organize', { path: work });
  assert.equal(r.moved.Images, 1);
  assert.ok(existsSync(join(work, 'Documents', 'notes.pdf')));
});

test('git, sqlite (read-only) and time tools', async () => {
  const repo = join(work, 'proj');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  writeFileSync(join(repo, 'a.txt'), 'x');
  assert.match((await dev('git_status', { path: repo })).status, /\?\? a\.txt/);

  const dbFile = join(work, 'shop.db');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbFile); db.exec("CREATE TABLE items (name TEXT, price INT); INSERT INTO items VALUES ('pen', 10)"); db.close();
  assert.equal(dev('db_query', { path: dbFile, sql: 'SELECT * FROM items WHERE price > ?', params: [5] }).rows[0].name, 'pen');
  assert.throws(() => dev('db_query', { path: dbFile, sql: "UPDATE items SET price = 0" }), /readonly|read-only/i);

  const c = dev('time_convert', { datetime: '2026-11-02T18:30', from: 'Asia/Kolkata', to: 'UTC' });
  assert.equal(c.utc, '2026-11-02T13:00:00.000Z');
  // New York is UTC-4 in July (daylight saving) and UTC-5 in January.
  assert.equal(dev('time_convert', { datetime: '2026-07-01T09:00', from: 'America/New_York', to: 'UTC' }).utc, '2026-07-01T13:00:00.000Z');
  assert.equal(dev('time_convert', { datetime: '2026-01-15T09:00', from: 'America/New_York', to: 'UTC' }).utc, '2026-01-15T14:00:00.000Z');
  assert.equal(dev('time_until', { datetime: new Date(Date.now() + 3 * 864e5 + 5e6).toISOString() }).days, 3);
});

test.after(() => mcp.stopAll());
