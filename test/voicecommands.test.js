import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseYesNo } from '../src/renderer/shared/voicecommands.js';

test('direct voice commands, as Whisper writes them', () => {
  assert.deepEqual(parseCommand('Show numbers.'), { cmd: 'numbers' });
  assert.deepEqual(parseCommand('show grid'), { cmd: 'grid' });
  assert.deepEqual(parseCommand('Hide numbers'), { cmd: 'hide' });
  assert.deepEqual(parseCommand('Click 12.'), { cmd: 'click', n: 12, double: false, right: false });
  assert.deepEqual(parseCommand('click five'), { cmd: 'click', n: 5, double: false, right: false });
  assert.deepEqual(parseCommand('Double click number 3'), { cmd: 'click', n: 3, double: true, right: false });
  assert.deepEqual(parseCommand('Click D7.'), { cmd: 'cell', cell: 'D7', double: false, right: false });
  assert.deepEqual(parseCommand('click b 10'), { cmd: 'cell', cell: 'B10', double: false, right: false });
  assert.deepEqual(parseCommand('Scroll down.'), { cmd: 'scroll', direction: 'down', amount: 5 });
  assert.deepEqual(parseCommand('scroll up a lot'), { cmd: 'scroll', direction: 'up', amount: 15 });
  assert.deepEqual(parseCommand('Press enter.'), { cmd: 'keys', keys: 'enter' });
  assert.deepEqual(parseCommand('press control s'), { cmd: 'keys', keys: 'ctrl+s' });
  assert.deepEqual(parseCommand('Go back.'), { cmd: 'keys', keys: 'alt+left' });
  assert.deepEqual(parseCommand('Type Hello Rahul, I will be late.'), { cmd: 'type', text: 'Hello Rahul, I will be late' });
  assert.deepEqual(parseCommand('எழுது வணக்கம் நண்பா'), { cmd: 'type', text: 'வணக்கம் நண்பா' });
  assert.deepEqual(parseCommand('கீழே போ'), { cmd: 'scroll', direction: 'down', amount: 5 });
});

test('questions are left for Maya', () => {
  for (const q of ['What is on my screen?', 'Click the send button in WhatsApp and tell Rahul hi', 'open the door for me', 'press release about the new phone', 'type of animals in india', 'write a leave letter to my HOD']) {
    assert.equal(parseCommand(q), null, q);
  }
});

test('spoken yes and no for approvals, English and Tamil', () => {
  for (const y of ['Yes.', 'yeah do it', 'OK', 'go ahead', 'ஆம்', 'சரி', 'சரி பண்ணு']) assert.equal(parseYesNo(y), true, y);
  for (const n of ['No.', 'cancel', "don't", 'வேண்டாம்', 'இல்லை']) assert.equal(parseYesNo(n), false, n);
  assert.equal(parseYesNo('what is this'), null);
});

test('emergency, reading, keyboard, scanning and editing by voice (English and Tamil)', () => {
  for (const s of ['Help!', 'help me', 'Emergency.', 'உதவி', 'காப்பாத்துங்க']) assert.deepEqual(parseCommand(s), { cmd: 'sos' }, s);
  for (const s of ['help me with my homework', 'can you help me write a letter', 'emergency numbers in India']) assert.notDeepEqual(parseCommand(s), { cmd: 'sos' }, s);
  assert.deepEqual(parseCommand("I'm okay."), { cmd: 'cancel' });
  assert.deepEqual(parseCommand('வேண்டாம்'), { cmd: 'cancel' });
  assert.deepEqual(parseCommand('Read the screen.'), { cmd: 'read' });
  assert.deepEqual(parseCommand('திரையை படி'), { cmd: 'read' });
  assert.deepEqual(parseCommand('Open keyboard'), { cmd: 'keyboard', on: true });
  assert.deepEqual(parseCommand('close the on-screen keyboard'), { cmd: 'keyboard', on: false });
  assert.deepEqual(parseCommand('Start scanning.'), { cmd: 'scan', on: true });
  assert.deepEqual(parseCommand('Select.'), { cmd: 'switch' });
  assert.deepEqual(parseCommand('Delete last word.'), { cmd: 'keys', keys: 'ctrl+backspace' });
  assert.deepEqual(parseCommand('New line'), { cmd: 'keys', keys: 'shift+enter' });
  assert.deepEqual(parseCommand('select all'), { cmd: 'keys', keys: 'ctrl+a' });
});
