// Starts the installed Maya and asks it to check GitHub for updates: node scripts/check-update.mjs
import { _electron as electron } from 'playwright';
import { join } from 'node:path';

const exe = join(process.env.LOCALAPPDATA, 'Programs', 'ather', 'Maya.exe'); // folder = package name, app = productName
const app = await electron.launch({ executablePath: exe });
try {
  const win = await app.firstWindow({ timeout: 30_000 });
  await win.waitForLoadState();
  const status = await win.evaluate(async () => {
    await window.ather.updateCheck();
    for (let i = 0; i < 30; i++) {
      const s = await window.ather.updateStatus();
      if (!['idle', 'checking'].includes(s.state)) return s;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return window.ather.updateStatus();
  });
  console.log(JSON.stringify(status));
} finally {
  await app.close();
}
