// PIN lock: scrypt-hashed PIN, lock on start / Windows lock / idle, and a brute-force pause.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(String(pin), salt, 32).toString('hex')}`;
}

export function verifyPin(pin, stored) {
  const [kind, salt, hash] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const got = scryptSync(String(pin), salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export const validPin = (pin) => /^\d{4,8}$/.test(String(pin));

export function createLock({ store, onChange = () => {} }) {
  let locked = !!store.getSetting('pinHash');
  let failures = 0;
  let pausedUntil = 0;

  const set = (value) => { if (locked !== value) { locked = value; onChange(locked); } };

  return {
    get locked() { return locked; },
    enabled: () => !!store.getSetting('pinHash'),
    lock() { if (store.getSetting('pinHash')) set(true); },

    /** Returns { ok } or { ok: false, wait } after 5 wrong PINs (30 s pause). */
    unlock(pin) {
      if (Date.now() < pausedUntil) return { ok: false, wait: Math.ceil((pausedUntil - Date.now()) / 1000) };
      if (verifyPin(pin, store.getSetting('pinHash'))) { failures = 0; set(false); return { ok: true }; }
      if (++failures >= 5) { failures = 0; pausedUntil = Date.now() + 30_000; }
      return { ok: false };
    },

    /** Set, change (needs the current PIN) or remove (newPin null) the PIN. */
    setPin(currentPin, newPin) {
      const existing = store.getSetting('pinHash');
      if (existing && !verifyPin(currentPin, existing)) throw new Error('The current PIN is wrong.');
      if (newPin === null) { store.setSetting('pinHash', null); set(false); return { enabled: false }; }
      if (!validPin(newPin)) throw new Error('Use 4 to 8 digits.');
      store.setSetting('pinHash', hashPin(newPin));
      return { enabled: true };
    },

    /** Lock after this many idle seconds (setting lockAfterMinutes, 0 = never). */
    checkIdle(idleSeconds) {
      const minutes = store.getSetting('lockAfterMinutes', 10);
      if (minutes > 0 && idleSeconds >= minutes * 60) this.lock();
    },
  };
}
