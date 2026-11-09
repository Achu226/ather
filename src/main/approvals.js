// Ask the user in a window before a risky tool runs. Unanswered requests are denied after 5 minutes.
import { ipcMain } from 'electron';

let seq = 0;
const waiting = new Map(); // id -> resolve

ipcMain.handle('approval:answer', (_, id, ok) => {
  waiting.get(id)?.(!!ok);
});

/**
 * Shows an approval card in `webContents`; resolves true only if the user clicks Allow.
 * `signal`: the request the card belongs to; stopping it denies the card. However it ends, the card is closed,
 * so a card can never be left behind for a request that is already over.
 */
export function requestApproval(webContents, request, signal) {
  return new Promise((resolve) => {
    if (!webContents || webContents.isDestroyed() || signal?.aborted) { resolve(false); return; }
    const id = ++seq;
    const finish = (ok) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      waiting.delete(id);
      if (!webContents.isDestroyed()) webContents.send('approval:closed', id);
      resolve(ok);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), 5 * 60_000);
    signal?.addEventListener('abort', onAbort);
    waiting.set(id, finish);
    webContents.send('approval:request', { id, ...request });
  });
}
