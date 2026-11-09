// Integration: smart search, MCP agent connection, calendar feeds. Needs Ollama + downloaded models + internet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const realModels = join(process.env.APPDATA || '', 'Ather', 'models');
process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-int-'));
process.env.ATHER_MODELS = realModels;
const { openStore } = await import('../src/main/store.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const ready = existsSync(join(realModels, 'hf', 'Xenova', 'clip-vit-base-patch32'))
  && await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);
const opts = { skip: !ready && 'needs Ollama and models', timeout: 300_000 };

test('smart search finds a note, a text file and a photo by meaning', opts, async () => {
  const core = await import('../src/main/ml/core.js');
  const { createSearch } = await import('../src/main/services/search.js');
  const store = openStore(':memory:');
  const search = createSearch({ store, ml: { call: (op, ...a) => core[op](...a) } });

  const dir = mkdtempSync(join(tmpdir(), 'ather-files-'));
  writeFileSync(join(dir, 'resume.txt'), 'Curriculum vitae. Skills: Java, SQL, React. Education: B.Tech computer science.');
  writeFileSync(join(dir, 'groceries.txt'), 'Buy rice, dal, onions and tomatoes.');
  // A sunny beach: blue sky over sand and sea.
  await sharp({ create: { width: 224, height: 224, channels: 3, background: '#f2d9a0' } })
    .composite([{ input: { create: { width: 224, height: 90, channels: 3, background: '#4aa3df' } }, top: 0, left: 0 },
      { input: { create: { width: 224, height: 40, channels: 3, background: '#1f6fb2' } }, top: 90, left: 0 }])
    .jpeg().toFile(join(dir, 'IMG_2041.jpg'));
  store.run("INSERT INTO notes (title, body) VALUES ('Lab exam', 'The DBMS lab exam is in room 204 on Monday')");

  await search.index([dir]);
  assert.match((await search.query('my CV with programming skills'))[0].path, /resume/);
  assert.equal((await search.query('where is the database lab test'))[0].kind, 'note');
  const photo = (await search.query('photo of the beach and the sea')).find((r) => r.kind === 'image');
  assert.ok(photo, 'beach photo should be in the results');
});

test('MCP server lists tools and an agent can add a task', opts, async () => {
  const { startMcp } = await import('../src/main/services/mcp.js');
  const { allTools } = await import('../src/main/tools/index.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const store = openStore(':memory:');
  const server = startMcp({ tools: allTools, ctx: { store, services: {} } });
  try {
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'tasks_create'));
    await client.callTool({ name: 'tasks_create', arguments: { title: 'Review PR from Claude' } });
    assert.equal(store.get('SELECT title FROM tasks').title, 'Review PR from Claude');
    await client.close();
  } finally {
    server.close();
  }
});

test('reads a public Google calendar feed', { timeout: 60_000 }, async () => {
  const { createCalendarFeeds } = await import('../src/main/services/calendar-feeds.js');
  const store = openStore(':memory:');
  store.setSetting('calendarFeeds', [{ name: 'Holidays', url: 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics' }]);
  const feeds = createCalendarFeeds({ store });
  const year = new Date().getFullYear();
  const events = await feeds.events(`${year}-01-01`, `${year}-12-31`);
  assert.ok(events.length > 5, `expected holidays, got ${events.length}`);
  assert.ok(events.every((e) => e.source === 'Holidays' && e.start.startsWith(String(year))));
});
