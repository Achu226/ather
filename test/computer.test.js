// Computer control through Windows UI Automation on a real app: Notepad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createPc } from '../src/main/services/pc.js';
import { computerTools, createComputerSession, toSendKeys, cellCenter, annotate } from '../src/main/tools/computer.js';

test('grid cells map to the middle of their part of the screen', () => {
  const screen = { x: 0, y: 0, width: 1600, height: 1000 };
  assert.deepEqual(cellCenter('A1', screen), { x: 50, y: 50 });
  assert.deepEqual(cellCenter('p10', screen), { x: 1550, y: 950 });
  assert.deepEqual(cellCenter(' D 7', screen), { x: 350, y: 650 });
  assert.equal(cellCenter('Q1', screen), null);
  assert.equal(cellCenter('A11', screen), null);
});

test('the screenshot gets the grid and control numbers drawn on it', async () => {
  const { default: sharp } = await import('sharp');
  const blank = await sharp({ create: { width: 1536, height: 960, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const url = await annotate(`data:image/jpeg;base64,${blank.toString('base64')}`, [{ i: 7, x: 768, y: 480, w: 192, h: 76 }], { x: 0, y: 0, width: 1536, height: 960 });
  const { width, height } = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata();
  assert.deepEqual([width, height], [1280, 800]); // scaled down for the model
  // The yellow number box covers the control's top-left corner.
  const { data } = await sharp(Buffer.from(url.split(',')[1], 'base64')).extract({ left: 563, top: 371, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 200 && data[1] > 170 && data[2] < 90, `pixel ${[...data]}`);
});

test('key combos translate to SendKeys', () => {
  assert.equal(toSendKeys('ctrl+s'), '^s');
  assert.equal(toSendKeys('alt+f4'), '%{F4}');
  assert.equal(toSendKeys('tab tab enter'), '{TAB}{TAB}{ENTER}');
  assert.equal(toSendKeys('ctrl+shift+t'), '^+t');
});

test('computer tools refuse to act before the user allows it', async () => {
  const services = { computer: createComputerSession(), pc: {} };
  const look = computerTools.find((t) => t.name === 'computer_look');
  await assert.rejects(look.run({}, { services }), /Call computer_start/);
  assert.ok(computerTools.find((t) => t.name === 'computer_start').confirm);
});

test('controls Notepad: finds the text area by UI Automation and types into it', { timeout: 120_000 }, async () => {
  const pc = createPc({ shell: { openPath: async () => '' } });
  const services = { pc, computer: createComputerSession() };
  const run = (name, args = {}) => computerTools.find((t) => t.name === name).run(args, { services });
  const notepad = execFile('notepad.exe');
  try {
    await new Promise((r) => setTimeout(r, 2500));
    run('computer_start', { task: 'test typing in Notepad' });
    // Make sure Notepad is in front (the test runner may own the foreground).
    const fg = await pc.foreground();
    if (!/notepad/i.test(fg.process)) {
      const list = await new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-Command', '(Get-Process notepad | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1).MainWindowHandle'], (e, out) => res(out.trim())));
      await pc.activate(list);
      await new Promise((r) => setTimeout(r, 600));
    }
    const look = await run('computer_look');
    assert.match(look.window, /Notepad/i);
    const field = look.controls.split('\n').find((l) => /(Edit|Document)/.test(l));
    assert.ok(field, look.controls);
    const index = Number(field.split(' ')[0]);
    await run('computer_type', { element: index, text: 'Hello from Maya' });
    const after = await run('computer_look');
    assert.match(after.window + after.controls, /Hello from Maya|\*/);
    assert.ok(services.computer.log().some((l) => l.action === 'type'));
    run('computer_done', { summary: 'typed' });
    assert.equal(services.computer.active, false);
  } finally {
    execFile('taskkill.exe', ['/IM', 'notepad.exe', '/F']);
    pc.stop();
  }
});
