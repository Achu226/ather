import { useEffect, useState } from 'react';
import { useSetting } from './Settings.jsx';

const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

function Card({ icon, name, on, detail, children, say }) {
  return (
    <section className="panel conn" aria-label={name}>
      <div className="row"><h2 style={{ margin: 0 }}>{icon} {name}</h2><span className="spacer" /><span className={`badge ${on ? '' : 'late'}`}>{on ? '✓ Connected' : 'Not connected'}</span></div>
      <p className="muted">{detail}</p>
      {children}
      {say && <p className="muted"><small>Say: “{say}”</small></p>}
    </section>
  );
}

/** Everything Maya can connect to, with its status: one place, each with a big button (or say it to Maya). */
export default function Connections({ go, version }) {
  const [feeds, setFeeds] = useSetting('calendarFeeds', []);
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [mail, setMail] = useState(null);
  const [sos, setSos] = useState({});
  const [chrome, setChrome] = useState([]);
  const [providers, setProviders] = useState([]);
  const [msg, setMsg] = useState(null);
  const [tg, setTg] = useState(null);
  const [token, setToken] = useState('');
  useEffect(() => { window.ather.telegramStatus?.().then(setTg).catch(() => {}); }, [version]);
  const connectTelegram = async (e) => {
    e.preventDefault();
    setMsg('Checking the token with Telegram…');
    try { setTg(await window.ather.telegramSetToken(token)); setToken(''); setMsg(null); } catch (err) { setMsg(`⚠ ${errText(err)}`); }
  };
  useEffect(() => {
    window.ather.getSetting('mail', null).then(setMail);
    window.ather.getSetting('sos', {}).then((s) => setSos(s || {}));
    window.ather.chromeProfiles().then(setChrome).catch(() => {});
    window.ather.providers?.().then(setProviders).catch(() => {});
  }, [version]);
  const open = async (name) => { setMsg(`Opening ${name}…`); try { await window.ather.tool('pc_open_app', { name }); setMsg(`✓ Opened ${name} in your browser.`); } catch (e) { setMsg(`⚠ ${errText(e)}`); } };
  const cloud = providers.filter((p) => !p.local && p.hasKey);

  return (
    <>
      <h1 className="page-title">Connections</h1>
      <p className="page-sub">What Maya can use for you. Everything stays on this PC; you can ask Maya instead of clicking.</p>
      {msg && <p className="muted" role="status">{msg}</p>}
      <div className="grid a11y-grid">
        <Card icon="✉️" name="Email (Gmail, Outlook, Yahoo)" on={!!mail} detail={mail ? `Signed in as ${mail.user}. Maya reads, sorts and replies (you approve each send).` : 'Connect once with an app password; Maya never sees your normal password.'} say="any emails I need to reply to?">
          <button className="btn primary" onClick={() => go('inbox')}>{mail ? 'Open Inbox' : 'Connect email'}</button>
        </Card>

        <Card icon="📅" name="Google / Outlook / Apple Calendar" on={feeds.length > 0} detail="Paste the calendar's private iCal (.ics) link. Google: Calendar settings → your calendar → “Secret address in iCal format”. Outlook: Settings → Calendar → Shared calendars → Publish → ICS. iCloud: share calendar → Public calendar." say="what's on my calendar this week?">
          <ul className="list">{feeds.map((f, i) => (
            <li className="item" key={i}><span className="item-title">📅 <b>{f.name}</b> <small className="muted">{f.url.slice(0, 48)}…</small></span>
              <button className="btn small" onClick={() => setFeeds(feeds.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>Remove</button></li>
          ))}</ul>
          <form className="row wrap" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\/|^webcal:\/\//i.test(feedUrl)) { setFeeds([...feeds, { name: feedName || 'Calendar', url: feedUrl.replace(/^webcal:/i, 'https:') }]); setFeedName(''); setFeedUrl(''); } else setMsg('⚠ Paste the full link starting with https:// or webcal://'); }}>
            <input className="input" style={{ width: 150 }} placeholder="Name (e.g. Google)" value={feedName} onChange={(e) => setFeedName(e.target.value)} aria-label="Calendar name" />
            <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="https://…/basic.ics" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} aria-label="Calendar link" />
            <button className="btn primary">Add calendar</button>
          </form>
        </Card>

        <Card icon="💬" name="WhatsApp" on detail="WhatsApp Web in your Chrome. Maya opens chats, writes messages for you to send, and saves videos and photos to your Desktop." say="open my WhatsApp chat with Amma / save the video from my WhatsApp to the desktop">
          <button className="btn" onClick={() => open('WhatsApp')}>Open WhatsApp</button>
        </Card>

        <Card icon="📞" name="Phone (Windows Phone Link)" on={!!sos.phones?.length} detail={sos.phones?.length ? `Emergency number ${sos.phones[0]}. Calls go through your paired phone.` : 'Pair your phone once in the Phone Link app, then save an emergency number.'} say="call Amma">
          <div className="row wrap"><button className="btn" onClick={() => open('Phone Link')}>Open Phone Link</button><button className="btn" onClick={() => go('accessibility')}>Emergency numbers</button></div>
        </Card>

        <Card icon="🌐" name="Chrome and your accounts" on={chrome.length > 0} detail={chrome.length ? `Maya opens Gmail, YouTube, Drive, ChatGPT and more signed in, in your Chrome profile (${chrome.length} found).` : 'Google Chrome was not found.'} say="open YouTube / open my Google Drive">
          <div className="row wrap">{['YouTube', 'Gmail', 'Google Drive', 'Google Calendar', 'ChatGPT', 'Gemini'].map((s) => <button key={s} className="btn small" onClick={() => open(s)}>{s}</button>)}</div>
          <button className="btn small" onClick={() => go('agent')}>Choose Chrome profile</button>
        </Card>

        <Card icon="🧠" name="Cloud AI (OpenAI, Gemini, Claude…)" on={cloud.length > 0} detail={cloud.length ? `Using: ${cloud.map((p) => p.name).join(', ')}. Also gives Maya the ChatGPT voices.` : 'Optional. Maya works fully offline; add a key for bigger models or the ChatGPT voices.'}>
          <button className="btn" onClick={() => go('models')}>AI models</button>
        </Card>

        <Card icon="✈️" name="Telegram (Maya on your phone)" on={!!tg?.paired}
          detail={tg?.paired ? `Paired with ${tg.chat} through @${tg.bot}. Message the bot from anywhere: questions, tasks, reminders, notes. Mouse, keyboard and sending mail still need your OK on the PC.`
            : 'Talk to Maya from your phone, free, through your own Telegram bot. Only your chat is answered.'}>
          {!tg?.configured && (
            <form className="field" onSubmit={connectTelegram}>
              <ol className="muted steps"><li>On your phone, open Telegram and message <b>@BotFather</b>.</li><li>Send <code>/newbot</code>, pick a name, and copy the token it gives you.</li><li>Paste it here.</li></ol>
              <div className="row wrap">
                <input className="input" style={{ flex: 1, minWidth: 220 }} type="password" autoComplete="off" placeholder="123456:ABC…" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Telegram bot token" />
                <button className="btn primary" disabled={!token.trim()}>Connect</button>
              </div>
            </form>
          )}
          {tg?.configured && !tg.paired && (
            <p>Now open <b>@{tg.bot}</b> in Telegram on your phone and send this code:<br /><span className="pair-code" aria-label={`Pairing code ${tg.code.split('').join(' ')}`}>{tg.code}</span></p>
          )}
          {tg?.error && <p className="muted" role="status">⚠ {tg.error}</p>}
          {tg?.configured && <button className="btn small" onClick={async () => setTg(await window.ather.telegramForget())}>Disconnect Telegram</button>}
        </Card>

        <Card icon="🔌" name="More tools (MCP)" on detail="GitHub, files, browser automation, docs and more, as connected tools Maya can use." >
          <button className="btn" onClick={() => go('mcp')}>Connected tools</button>
        </Card>
      </div>
    </>
  );
}
