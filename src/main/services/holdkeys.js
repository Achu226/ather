// Push-to-talk like a walkie-talkie: hold Right Ctrl to give Maya a command, hold Right Alt to dictate; let go to finish.
// A small PowerShell watcher reports key states; the timing rules live here so they can be tested.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { dataDir } from '../paths.js';

// Prints "ctrl alt other" (1/0 each) whenever one changes. "other" = any key except Ctrl/Alt, so Right Ctrl+C is not a hold.
const WATCHER = String.raw`
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Threading;
public static class MayaHoldKeys {
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  public static void Run() {
    string last = "";
    while (true) {
      bool other = false;
      for (int vk = 0x08; vk <= 0xFE && !other; vk++) {
        if (vk == 0x11 || vk == 0x12 || (vk >= 0xA2 && vk <= 0xA5)) continue; // Ctrl and Alt (AltGr also reports Left Ctrl)
        if (Down(vk)) other = true;
      }
      string now = (Down(0xA3) ? "1" : "0") + " " + (Down(0xA5) ? "1" : "0") + " " + (other ? "1" : "0");
      if (now != last) { Console.WriteLine(now); last = now; }
      Thread.Sleep(25);
    }
  }
}
"@
[MayaHoldKeys]::Run()
`;

const KEYS = [['ctrl', 'command'], ['alt', 'dictate']];

/**
 * The hold rules: a key counts after `hold` ms with no other key pressed → onStart(mode); releasing it → onEnd(mode);
 * another key while held → onCancel(mode) (it was a shortcut, not talking). Exported for tests.
 */
export function createHoldMachine({ onStart, onEnd, onCancel, hold = 300, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const s = Object.fromEntries(KEYS.map(([k]) => [k, { down: false, active: false, spoiled: false, timer: null }]));
  return (state) => {
    for (const [k, mode] of KEYS) {
      const st = s[k];
      if (state[k] && !st.down) {
        Object.assign(st, { down: true, spoiled: !!state.other, active: false });
        st.timer = setTimer(() => { if (st.down && !st.spoiled) { st.active = true; onStart(mode); } }, hold);
      } else if (state[k] && state.other && !st.spoiled) {
        st.spoiled = true;
        if (st.active) { st.active = false; onCancel(mode); }
      } else if (!state[k] && st.down) {
        st.down = false;
        clearTimer(st.timer);
        if (st.active) { st.active = false; onEnd(mode); }
      }
    }
  };
}

export function createHoldKeys(handlers) {
  let child = null;
  return {
    start() {
      if (child) return;
      const file = join(dataDir, 'hold-keys.ps1');
      writeFileSync(file, WATCHER);
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
      const feed = createHoldMachine(handlers);
      createInterface({ input: child.stdout }).on('line', (line) => {
        const [ctrl, alt, other] = line.trim().split(' ').map((x) => x === '1');
        feed({ ctrl, alt, other });
      });
      child.on('exit', () => { child = null; });
    },
    stop() { child?.kill(); child = null; },
    get running() { return !!child; },
  };
}
