// Passwords (e.g. the email app password) encrypted with Windows DPAPI through Electron safeStorage.
import { safeStorage } from 'electron';

export function createSecrets(store) {
  return {
    set(name, value) {
      store.setSetting(`secret:${name}`, value ? safeStorage.encryptString(value).toString('base64') : null);
    },
    get(name) {
      const enc = store.getSetting(`secret:${name}`);
      return enc ? safeStorage.decryptString(Buffer.from(enc, 'base64')) : null;
    },
    has: (name) => !!store.getSetting(`secret:${name}`),
  };
}
