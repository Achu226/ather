// "This PC" monitor: CPU, memory, disk, GPU (NVIDIA), battery and the busiest apps.
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const run = (exe, args) => new Promise((resolve) => execFile(exe, args, { windowsHide: true, timeout: 8000 }, (e, out) => resolve(e ? '' : out)));
const gb = (bytes) => Math.round((bytes / 1024 ** 3) * 10) / 10;

/** CPU busy % over a short sample. */
async function cpuPercent(ms = 400) {
  const totals = () => os.cpus().reduce((t, c) => { const all = Object.values(c.times).reduce((a, b) => a + b, 0); return { idle: t.idle + c.times.idle, all: t.all + all }; }, { idle: 0, all: 0 });
  const a = totals();
  await new Promise((r) => setTimeout(r, ms));
  const b = totals();
  return Math.round(100 * (1 - (b.idle - a.idle) / Math.max(1, b.all - a.all)));
}

async function gpu() {
  const out = await run('nvidia-smi', ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits']);
  const [name, load, used, total, temp] = out.split('\n')[0]?.split(',').map((s) => s.trim()) ?? [];
  return name ? { name, load_percent: Number(load), memory_used_gb: gb(Number(used) * 1024 ** 2), memory_total_gb: gb(Number(total) * 1024 ** 2), temperature_c: Number(temp) } : null;
}

async function battery() {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress']);
  try {
    const b = [].concat(JSON.parse(out))[0];
    // BatteryStatus 2 = on mains power (charging or full)
    return b ? { percent: b.EstimatedChargeRemaining, charging: b.BatteryStatus === 2 || b.BatteryStatus >= 6 } : null;
  } catch { return null; }
}

async function topApps() {
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-Process | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{ name = $_.Name; mb = [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) } } | Sort-Object mb -Descending | Select-Object -First 6 | ConvertTo-Json -Compress']);
  try { return [].concat(JSON.parse(out)).map((p) => ({ app: p.name, memory_mb: p.mb })); } catch { return []; }
}

export async function systemStatus({ apps = true } = {}) {
  const [cpu, g, bat, top, disk] = await Promise.all([cpuPercent(), gpu(), battery(), apps ? topApps() : [], statfs('C:\\').catch(() => null)]);
  const total = os.totalmem(), free = os.freemem();
  return {
    cpu: { load_percent: cpu, model: os.cpus()[0]?.model.trim(), cores: os.cpus().length },
    memory: { used_gb: gb(total - free), total_gb: gb(total), percent: Math.round((100 * (total - free)) / total) },
    disk: disk && { drive: 'C:', free_gb: gb(disk.bavail * disk.bsize), total_gb: gb(disk.blocks * disk.bsize), percent: Math.round(100 * (1 - disk.bavail / disk.blocks)) },
    gpu: g,
    battery: bat,
    uptime_hours: Math.round(os.uptime() / 360) / 10,
    busiest_apps: top,
  };
}
