// "Type with your voice": transcribed text is pasted into whatever app has focus.
// Electron 45's clipboard is async: every read and write is awaited.
import { clipboard } from 'electron';
import { execFile } from 'node:child_process';

const sendKeys = (keys) => new Promise((resolve) => execFile('powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject WScript.Shell).SendKeys('${keys}')`], { windowsHide: true }, () => resolve()));

/** Text currently selected in whatever app has focus (copied with Ctrl+C, clipboard restored after). */
export async function copySelection() {
  const previous = await clipboard.readText();
  await clipboard.writeText('');
  await sendKeys('^c');
  await new Promise((r) => setTimeout(r, 250));
  const selected = await clipboard.readText();
  await clipboard.writeText(previous);
  return selected.trim();
}

/** Put text on the clipboard and paste it into the app with focus (the text stays on the clipboard). */
export async function pasteClip(text) {
  await clipboard.writeText(text);
  await new Promise((r) => setTimeout(r, 150));
  await sendKeys('^v');
}

export async function pasteText(text) {
  const previous = await clipboard.readText();
  await clipboard.writeText(text);
  await sendKeys('^v');
  // Put the user's clipboard back once the paste has landed.
  await new Promise((r) => setTimeout(r, 400));
  await clipboard.writeText(previous);
}
