// Acceptance test (master prompt, feature 2): the agent fixes a reproducible bug so the project's tests pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ATHER_DATA = mkdtempSync(join(tmpdir(), 'ather-code-'));
const { openStore } = await import('../src/main/store.js');
const { ask } = await import('../src/main/brain.js');
const { allTools } = await import('../src/main/tools/index.js');
const { OLLAMA } = await import('../src/main/ollama.js');
const running = await fetch(`${OLLAMA}/api/version`).then((r) => r.ok, () => false);

test('agent finds and fixes a bug until the tests pass', { skip: !running && 'Ollama not running', timeout: 900_000 }, async () => {
  const proj = mkdtempSync(join(tmpdir(), 'ather-bugproj-'));
  writeFileSync(join(proj, 'package.json'), JSON.stringify({ name: 'calc', version: '1.0.0', type: 'module', scripts: { test: 'node test.js' } }));
  writeFileSync(join(proj, 'calc.js'), 'export function add(a, b) {\n  return a - b;\n}\n\nexport function multiply(a, b) {\n  return a * b;\n}\n');
  writeFileSync(join(proj, 'test.js'), "import assert from 'node:assert/strict';\nimport { add, multiply } from './calc.js';\nassert.equal(add(2, 3), 5);\nassert.equal(multiply(4, 5), 20);\nconsole.log('all tests passed');\n");
  assert.throws(() => execFileSync('npm.cmd', ['test'], { cwd: proj, stdio: 'pipe', shell: true }));

  const store = openStore(':memory:');
  store.setSetting('approvedFolders', [proj]);
  const used = [];
  const answer = await ask({
    text: `The project in ${proj} has a failing test. Run "npm test" there, read the code, fix the bug in calc.js, then run the tests again to confirm they pass.`,
    store, tools: allTools, style: 'chat', mode: 'agent',
    services: { confirm: async () => true, trash: async () => {} },
    onEvent: (e) => e.type === 'tool' && used.push(e.name),
  });
  console.log('tools used:', used.join(', '));
  console.log('calc.js:', JSON.stringify(readFileSync(join(proj, 'calc.js'), 'utf8')), 'test.js:', JSON.stringify(readFileSync(join(proj, 'test.js'), 'utf8')));
  assert.match(readFileSync(join(proj, 'calc.js'), 'utf8'), /return a \+ b/);
  assert.match(readFileSync(join(proj, 'test.js'), 'utf8'), /assert\.equal\(add\(2, 3\), 5\)/, 'the test itself must not be changed to pass');
  assert.match(execFileSync('npm.cmd', ['test'], { cwd: proj, shell: true }).toString(), /all tests passed/);
  assert.ok(used.filter((n) => n === 'run_command').length >= 2, 'should run the tests before and after the fix');
  assert.ok(answer.length > 0);
});

test('agent finds a bug in a Python project without being told which file', { skip: !running && 'Ollama not running', timeout: 900_000 }, async () => {
  const proj = mkdtempSync(join(tmpdir(), 'maya-pyproj-'));
  writeFileSync(join(proj, 'shop.py'), 'from prices import total\n\ndef bill(items):\n    return round(total(items), 2)\n');
  writeFileSync(join(proj, 'prices.py'), 'def total(items):\n    s = 0\n    for name, price, qty in items:\n        s += price + qty\n    return s\n');
  writeFileSync(join(proj, 'test_shop.py'), 'from shop import bill\nassert bill([("pen", 10.0, 2), ("book", 50.0, 1)]) == 70.0, bill([("pen", 10.0, 2), ("book", 50.0, 1)])\nprint("all tests passed")\n');
  assert.throws(() => execFileSync('python', ['test_shop.py'], { cwd: proj, stdio: 'pipe' }));
  const store = openStore(':memory:');
  store.setSetting('approvedFolders', [proj]);
  const used = [];
  await ask({
    text: `The Python project in ${proj} has a failing test (run "python test_shop.py"). Find the bug and fix it, then run the test again to confirm it passes.`,
    store, tools: allTools, style: 'chat', mode: 'agent',
    services: { confirm: async () => true, trash: async () => {} },
    onEvent: (e) => e.type === 'tool' && used.push(e.name),
  });
  console.log('tools used:', used.join(', '));
  assert.match(execFileSync('python', ['test_shop.py'], { cwd: proj }).toString(), /all tests passed/);
  assert.match(readFileSync(join(proj, 'prices.py'), 'utf8'), /price \* qty|qty \* price/, 'the real bug is fixed');
  assert.match(readFileSync(join(proj, 'test_shop.py'), 'utf8'), /== 70\.0/, 'the test itself must not be changed to pass');
});
