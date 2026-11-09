// Talk to Maya from your phone through your own Telegram bot (free). Off until the user pastes a bot token from
// @BotFather; the token is kept encrypted (secrets). The first chat that sends the 6-digit code shown in Maya becomes
// the owner, and every other chat is ignored without a reply. From the phone Maya answers and does safe things
// (tasks, reminders, notes, questions); anything that needs an approval card is refused: approve it on the PC.
import { randomInt } from 'node:crypto';

const API = 'https://api.telegram.org/bot';
const LIMIT = 4096; // Telegram's longest message

/** A long answer in Telegram-sized parts (exported for tests). */
export const splitMessage = (text) => {
  const parts = [];
  for (let s = String(text || '…'); s.length; s = s.slice(LIMIT)) parts.push(s.slice(0, LIMIT));
  return parts;
};

const newCode = () => String(randomInt(100000, 1000000));

export function createTelegram({ store, secrets, answer, fetchFn = fetch, onChange = () => {} }) {
  const state = () => ({ ownerId: null, chat: '', code: '', bot: '', offset: 0, ...store.getSetting('telegram', {}) });
  const save = (patch) => { store.setSetting('telegram', { ...state(), ...patch }); onChange(); };
  let running = false, error = null;

  async function call(method, body = {}, token = secrets.get('telegram-token')) {
    const res = await fetchFn(`${API}${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw Object.assign(new Error('Telegram no longer accepts the bot token: paste a new one from @BotFather.'), { unauthorized: true });
    if (!res.ok || !data.ok) throw new Error(`Telegram: ${data.description || `error ${res.status}`}`);
    return data.result;
  }
  const send = async (chatId, text) => { for (const part of splitMessage(text)) await call('sendMessage', { chat_id: chatId, text: part }); };

  async function handle(msg) {
    const chatId = msg.chat?.id, text = String(msg.text || '').trim();
    if (!chatId || !text) return;
    const s = state();
    if (!s.ownerId) {
      if (text.replace(/^\/start\s*/, '') !== s.code) return send(chatId, 'Hi! To use me, send the 6-digit code shown in Maya on your PC (Connections → Telegram).');
      save({ ownerId: chatId, chat: msg.from?.first_name || 'you', code: '' });
      return send(chatId, '✅ Paired! I am Maya. Ask me anything, or tell me to add a task, a reminder or a note. Things that need your OK (mouse and keyboard, sending mail) must be approved on the PC.');
    }
    if (chatId !== s.ownerId) return; // strangers get nothing, not even a hint that the bot works
    const refused = [];
    let reply;
    try {
      reply = await answer(text, { confirm: async (req) => { refused.push(req.name); return false; } });
    } catch (e) { reply = `Sorry, that did not work: ${e.message}`; }
    if (refused.length) reply += `\n\n🔒 For safety, approve ${[...new Set(refused)].map((n) => n.replace(/_/g, ' ')).join(', ')} on the PC.`;
    await send(chatId, reply);
  }

  /** One round of long polling: handles every new message once; false when Telegram could not be reached. */
  async function pollOnce(timeout = 0) {
    if (!secrets.get('telegram-token')) return false;
    try {
      const updates = await call('getUpdates', { offset: state().offset, timeout, allowed_updates: ['message'] });
      for (const u of updates) {
        save({ offset: u.update_id + 1 }); // first: a message that crashes Maya is not retried forever
        if (u.message) await handle(u.message).catch(() => {});
      }
      error = null;
      return true;
    } catch (e) {
      error = e.message;
      if (e.unauthorized) running = false;
      onChange();
      return false;
    }
  }

  return {
    status: () => { const s = state(); return { configured: !!secrets.get('telegram-token'), bot: s.bot, paired: !!s.ownerId, chat: s.chat, code: s.ownerId ? '' : s.code, running, error }; },
    /** Checks the token with Telegram, keeps it encrypted, and starts a fresh pairing. */
    async setToken(token) {
      token = String(token || '').trim();
      let me;
      try { me = await call('getMe', {}, token); } catch { throw new Error('Telegram did not accept this token. Copy it again from @BotFather (it looks like 123456:ABC…).'); }
      secrets.set('telegram-token', token);
      save({ bot: me.username, ownerId: null, chat: '', code: newCode(), offset: 0 });
      error = null;
      return this.status();
    },
    /** A reminder to the paired phone; does nothing if not paired and never throws (it runs inside timers). */
    async notify(text) {
      const { ownerId } = state();
      if (ownerId && secrets.get('telegram-token')) await send(ownerId, text).catch(() => {});
    },
    forget() { this.stop(); secrets.set('telegram-token', null); store.setSetting('telegram', {}); error = null; onChange(); },
    pollOnce,
    start() {
      if (running || !secrets.get('telegram-token')) return;
      running = true;
      (async () => {
        // Offline or Telegram down: wait a little before trying again (a revoked token stops the loop).
        while (running) if (!(await pollOnce(25))) await new Promise((r) => setTimeout(r, 5000));
      })();
    },
    stop() { running = false; },
  };
}
