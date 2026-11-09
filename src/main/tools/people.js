// People and feelings: a contact book for calls and WhatsApp by voice, and a spoken diary with moods.
import { now } from '../store.js';
import { matchApp } from '../services/pc.js';
import { SOS_DEFAULTS, MEDICAL_FIELDS, medicalLines } from '../services/sos.js';

const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
export const MOODS = ['happy', 'calm', 'excited', 'grateful', 'tired', 'sad', 'worried', 'angry', 'lonely', 'in pain'];

/** Digits for WhatsApp/phone links: a 10-digit number gets the country code (India by default). Exported for tests. */
export function intlNumber(phone, country = '91') {
  const digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('00')) return digits.slice(2);
  const local = digits.replace(/^0+/, '');
  return local.length === 10 ? `${country}${local}` : local;
}

/** The contact the user means: by name or relation ("Amma", "my brother"). */
export function findContact(store, who) {
  const all = store.all('SELECT * FROM contacts WHERE deleted = 0');
  // Small models write things like "Lakshmi (amma)" or "my amma": try every word as a name or a relation.
  const words = String(who).toLowerCase().replace(/[()"'.,]/g, ' ').split(/\s+/).filter((w) => w && !['my', 'to', 'the', 'dear'].includes(w));
  const q = words.join(' ');
  const byRelation = all.find((c) => c.relation && (c.relation.toLowerCase() === q || words.includes(c.relation.toLowerCase())));
  if (byRelation) return byRelation;
  const exact = all.find((c) => words.includes(c.name.toLowerCase()) || c.name.toLowerCase() === q);
  if (exact) return exact;
  const name = matchApp(q, all.map((c) => c.name)) || words.map((w) => matchApp(w, all.map((c) => c.name))).find(Boolean);
  return name ? all.find((c) => c.name === name) : null;
}

const notFound = (store, who) => ({ error: `No contact called "${who}". Saved: ${store.all('SELECT name FROM contacts WHERE deleted = 0').map((c) => c.name).join(', ') || 'none yet'}. Add one with contacts_add.` });

export const peopleTools = [
  {
    name: 'medical_id',
    description: 'The user\'s Medical ID (blood group, allergies, conditions, medicines, doctor): shown on the SOS help sign and emailed to caregivers in an emergency. '
      + 'Call with the fields the user just told you to save them; call with nothing to read it out.',
    parameters: obj(Object.fromEntries(MEDICAL_FIELDS.map(([k, label]) => [k, str(`${label} as the user said it${k === 'doctor' ? ' (name and phone)' : ''}`)]))),
    run: (args, { store }) => {
      const sos = { ...SOS_DEFAULTS, ...store.getSetting('sos', SOS_DEFAULTS) };
      const given = Object.fromEntries(MEDICAL_FIELDS.map(([k]) => [k, args[k]]).filter(([, v]) => String(v ?? '').trim()));
      if (Object.keys(given).length) store.setSetting('sos', { ...sos, medical: { ...sos.medical, ...given } });
      const medical = medicalLines({ ...sos.medical, ...given });
      return { medical, ...(Object.keys(given).length && { saved: Object.keys(given) }),
        note: medical.length ? 'Shown on the SOS help sign and sent to caregivers in an emergency. Read it back to the user.' : 'Nothing saved yet: ask for blood group, allergies, conditions, medicines and doctor.' };
    },
  },
  {
    name: 'contacts_add',
    description: 'Save a contact (name, phone, optional email and relation like "amma", "brother", "doctor") so the user can call or WhatsApp them by voice. Only saves: never call or message them unless the user asked.',
    parameters: obj({ name: str('Name'), phone: str('Phone number'), email: str('Email, optional'), relation: str('Relation, optional: amma, appa, brother, friend, doctor…') }, ['name']),
    run: ({ name, phone, email, relation }, { store }) => {
      if (phone && String(phone).replace(/\D/g, '').length < 6) return { error: 'That phone number looks too short.' };
      const old = store.get('SELECT id FROM contacts WHERE deleted = 0 AND lower(name) = lower(?)', name.trim());
      const row = { name: name.trim(), phone: phone || null, email: email || null, relation: relation?.toLowerCase() || null };
      return old ? store.update('contacts', old.id, row, `Updated contact ${name}`) : store.insert('contacts', { ...row, created_at: now() }, `Saved contact ${name}`);
    },
  },
  {
    name: 'contacts_query',
    description: 'Find the user\'s saved contacts (by name or relation), or list them all.',
    parameters: obj({ who: str('Name or relation; empty = all') }),
    run: ({ who }, { store }) => (who ? [findContact(store, who)].filter(Boolean) : store.all('SELECT id, name, phone, email, relation FROM contacts WHERE deleted = 0 ORDER BY name')),
  },
  {
    name: 'contacts_delete',
    description: 'Delete a saved contact (can be undone).',
    parameters: obj({ id: { type: 'integer' } }, ['id']),
    run: ({ id }, { store }) => store.update('contacts', id, { deleted: 1 }, `Deleted contact ${id}`),
  },
  {
    name: 'call_contact',
    description: 'Phone call a saved contact (or a number) through the user\'s paired phone (Windows Phone Link): "call Amma", "call Rahul". Call it right away when asked: Maya shows the approval card herself, so do not ask in text first.',
    confirm: true,
    parameters: obj({ who: str('Contact name / relation, or a phone number') }, ['who']),
    run: async ({ who }, { store, services }) => {
      const c = /\d{6,}/.test(who.replace(/\D/g, '')) ? { name: who, phone: who } : findContact(store, who);
      if (!c) return notFound(store, who);
      if (!c.phone) return { error: `${c.name} has no phone number saved.` };
      const r = await services.phoneCall(c.phone);
      return r.error ? r : { calling: c.name };
    },
  },
  {
    name: 'whatsapp_message',
    description: 'Open WhatsApp with a message to a saved contact ready to send: "WhatsApp Amma that I reached home". Maya does not press Send; the user sends it (or says "press enter").',
    parameters: obj({ who: str('Contact name / relation, or a phone number'), message: str('The message, in the user\'s words') }, ['who', 'message']),
    run: async ({ who, message }, { store, services }) => {
      const c = /\d{6,}/.test(who.replace(/\D/g, '')) ? { name: who, phone: who } : findContact(store, who);
      if (!c) return notFound(store, who);
      if (!c.phone) return { error: `${c.name} has no phone number saved.` };
      const phone = intlNumber(c.phone, store.getSetting('phoneCountry', '91'));
      const text = encodeURIComponent(message);
      // The WhatsApp app if it is installed, otherwise WhatsApp Web in the browser.
      const app = (await services.pc.storeApps?.().catch(() => ({})))?.WhatsApp;
      const web = `https://web.whatsapp.com/send?phone=${phone}&text=${text}`;
      await (app ? services.openExternal(`whatsapp://send?phone=${phone}&text=${text}`) : services.pc?.openUrl ? services.pc.openUrl(web) : services.openExternal(web)); // the user's signed-in Chrome
      return { opened: app ? 'WhatsApp' : 'WhatsApp Web', to: c.name, message, sent: false, tell_user: `The message to ${c.name} is ready in WhatsApp. Press Send, or say "press enter".` };
    },
  },
  {
    name: 'whatsapp_open_chat',
    description: 'Open a WhatsApp chat in the user\'s signed-in browser (WhatsApp Web): by phone number, saved contact, or "me" for the user\'s own chat (messages to yourself). Use it before reading or downloading things from a chat.',
    parameters: obj({ who: str('Phone number, contact name, or "me"') }, ['who']),
    run: async ({ who }, { store, services }) => {
      const mine = /^(me|myself|my (own )?(number|chat|whatsapp))$/i.test(who.trim());
      const c = /\d{6,}/.test(who.replace(/\D/g, '')) ? { name: who, phone: who } : findContact(store, mine ? 'me' : who);
      if (!c) return mine ? { error: 'I do not know your own number yet. Say "save my number as 98400 12345" (contact name: Me) once.' } : notFound(store, who);
      if (!c.phone) return { error: `${c.name} has no phone number saved.` };
      const phone = intlNumber(c.phone, store.getSetting('phoneCountry', '91'));
      if (phone.length < 10) return { error: `${c.phone} looks too short for a phone number. Check the digits.` };
      const url = `https://web.whatsapp.com/send?phone=${phone}`;
      await (services.pc?.openUrl ? services.pc.openUrl(url) : services.openExternal(url));
      return { opened: 'WhatsApp Web', chat: c.name, phone: `+${phone}`, next: 'computer_start, then computer_look to see the chat' };
    },
  },
  {
    name: 'diary_add',
    description: 'Save a spoken diary entry: "dear diary…", "note in my diary that…", or when the user shares how their day went and asks to keep it. Choose the mood that fits.',
    parameters: obj({ text: str('The entry, in the user\'s own words'), mood: { type: 'string', enum: MOODS } }, ['text']),
    run: ({ text, mood }, { store }) => store.insert('diary', { text: text.trim(), mood: MOODS.includes(mood) ? mood : null, created_at: now() }, 'Saved a diary entry'),
  },
  {
    name: 'diary_query',
    description: 'Read the user\'s diary for the last days, with a count of moods: "how was my week?", "what did I write yesterday?". Summarise gently.',
    parameters: obj({ days: { type: 'integer', description: 'How many days back, default 7' } }),
    run: ({ days = 7 }, { store }) => {
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const entries = store.all('SELECT id, text, mood, created_at FROM diary WHERE deleted = 0 AND created_at >= ? ORDER BY id', since);
      const moods = {};
      for (const e of entries) if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1;
      return { days, entries: entries.map((e) => ({ ...e, when: new Date(e.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })), moods };
    },
  },
];
