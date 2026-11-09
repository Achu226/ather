import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTools } from '../src/main/tools/select.js';
import { allTools } from '../src/main/tools/index.js';

const names = (text, opts) => selectTools(allTools, text, opts).map((t) => t.name);

test('plain questions get only the few always-on tools', () => {
  const n = names('what is an API?');
  assert.ok(n.length <= 8, `${n.length}: ${n}`);
  assert.ok(n.includes('web_search') && n.includes('memory_save'));
});

test('requests pull in the tools they need', () => {
  assert.ok(names('set volume to 30').includes('pc_volume'));
  assert.ok(names('remind me to call mom at 8pm').includes('reminders_create'));
  assert.ok(names('make a 10 slide ppt on cloud computing').includes('files_make_presentation'));
  assert.ok(names('plot sin x with python').includes('python_run'));
  assert.ok(names('quiz me on DBMS').includes('study_create'));
  assert.ok(names("what's on my screen").includes('screen_look'));
  assert.ok(names('how much time did I spend on youtube today').includes('activity_query'));
  assert.ok(names('what is this?', { images: 1 }).includes('images_blur'));
});

test('asking Maya to use the mouse and keyboard in an app offers computer control', () => {
  for (const text of [
    'Open the Calculator app and use the mouse and keyboard in it to work out 12 times 7',
    'open calculator and calculate 12 times 7',
    'use my keyboard and mouse to rename this file',
    'using the mouse, drag the window to the left',
    'open paint and draw a circle',
  ]) assert.ok(names(text).includes('computer_start'), text);
  // A plain sum is answered, not done by clicking around an app.
  assert.ok(!names('what is 12 times 7?').includes('computer_start'));
  assert.ok(!names('my mouse is not working, what should I do?').includes('computer_start'));
});

test('a follow-up keeps the tools of the previous request', () => {
  assert.ok(names('make it 20 instead', { previous: 'set volume to 30' }).includes('pc_volume'));
});

test('agent mode gets every tool', () => {
  assert.equal(selectTools(allTools, 'anything', { agent: true }).length, allTools.length);
});
