// Updates from GitHub releases (electron-updater). Quietly does nothing until a release feed is configured.
import { app } from 'electron';
import updaterPkg from 'electron-updater';

const { autoUpdater } = updaterPkg;

export function createUpdater({ onStatus }) {
  let status = { state: 'idle', version: app.getVersion() };
  const set = (patch) => { status = { ...status, ...patch }; onStatus(status); };

  autoUpdater.logger = null; // status reaches the user through Settings; no console noise
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ state: 'checking', error: null }));
  autoUpdater.on('update-not-available', () => set({ state: 'latest' }));
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', available: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', available: info.version }));
  autoUpdater.on('error', (e) => set({ state: 'error', error: /app-update\.yml|ENOENT|404/.test(e.message) ? 'Updates are not set up for this build yet.' : e.message }));

  return {
    status: () => status,
    async check() {
      if (!app.isPackaged) { set({ state: 'error', error: 'Updates only work in the installed app.' }); return status; }
      await autoUpdater.checkForUpdates().catch(() => {});
      return status;
    },
    install: () => autoUpdater.quitAndInstall(),
  };
}
