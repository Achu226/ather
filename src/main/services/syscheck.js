// "Can my computer run it?": memory, graphics card, disk space and a plain verdict.
import { execFile } from 'node:child_process';
import { statfsSync } from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import { dataDir } from '../paths.js';

const run = promisify(execFile);

async function gpus() {
  try {
    const { stdout } = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true });
    return stdout.trim().split('\n').map((l) => { const [name, mb] = l.split(','); return { name: name.trim(), vramGB: Math.round(Number(mb) / 102.4) / 10 }; });
  } catch {
    try {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json'], { windowsHide: true });
      return [].concat(JSON.parse(stdout)).map((g) => ({ name: g.Name, vramGB: Math.round((g.AdapterRAM || 0) / 1e8) / 10 }));
    } catch { return []; }
  }
}

export async function systemCheck() {
  const ramGB = Math.round(os.totalmem() / 1e8) / 10;
  const fs = statfsSync(dataDir);
  const freeGB = Math.round((fs.bavail * fs.bsize) / 1e8) / 10;
  const cards = await gpus();
  const best = cards.reduce((a, g) => (g.vramGB > (a?.vramGB ?? -1) ? g : a), null);

  const checks = [
    { name: 'Memory (RAM)', value: `${ramGB} GB`, ok: ramGB >= 8, need: '8 GB or more' },
    { name: 'Graphics card', value: best ? `${best.name} (${best.vramGB} GB)` : 'none found', ok: !!best && best.vramGB >= 4, need: '4 GB graphics memory for fast answers' },
    { name: 'Free disk space', value: `${freeGB} GB`, ok: freeGB >= 8, need: '8 GB for the AI models' },
    { name: 'Processor', value: os.cpus()[0]?.model.trim() || 'unknown', ok: os.cpus().length >= 4, need: '4 cores or more' },
  ];
  const verdict = checks.every((c) => c.ok) ? 'Your computer runs Maya\'s local AI well.'
    : ramGB >= 8 ? 'Maya will run, but answers may be slower on this computer.'
      : 'This computer is below the minimum; the local AI may not load.';
  return { checks, verdict, ramGB, vramGB: best?.vramGB || 0 };
}
