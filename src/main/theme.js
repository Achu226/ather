// Light / dark theme: Windows title bars, tray + window icons, and (installed app) the Maya shortcuts' icons.
import { app, nativeTheme } from 'electron';
import { copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './paths.js';

const asset = (name) => fileURLToPath(new URL(`../../assets/${name}`, import.meta.url));

const SHORTCUTS = `
$shell = New-Object -ComObject WScript.Shell
$links = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'),
  "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs") | ForEach-Object { Join-Path $_ 'Maya.lnk' }
foreach ($p in $links) { if (Test-Path $p) { $l = $shell.CreateShortcut($p); $l.IconLocation = "$env:ATHER_ICO,0"; $l.Save() } }
ie4uinit.exe -show
`;

export function createTheme({ store, windows }) {
  function update() {
    const dark = nativeTheme.shouldUseDarkColors;
    windows.setIcon(asset(dark ? 'icon-dark.png' : 'icon.png'), dark);
    windows.broadcast('theme:changed', dark ? 'dark' : 'light');
    // Explorer reads shortcut icons from disk, not from inside app.asar, so copy the .ico out first.
    const variant = dark ? 'dark' : 'light';
    if (app.isPackaged && store.getSetting('shortcutIcon') !== variant) {
      const ico = join(dataDir, `icon-${variant}.ico`);
      copyFileSync(asset(dark ? 'icon-dark.ico' : 'icon.ico'), ico);
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SHORTCUTS],
        { windowsHide: true, env: { ...process.env, ATHER_ICO: ico } }, (err) => { if (!err) store.setSetting('shortcutIcon', variant); });
    }
  }

  nativeTheme.on('updated', update);
  return {
    /** Re-read the "theme" setting (system | light | dark) and apply it everywhere. */
    apply() { nativeTheme.themeSource = store.getSetting('theme', 'system'); update(); },
    resolved: () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
  };
}
