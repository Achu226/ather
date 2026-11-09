import { useEffect, useState } from 'react';
import { useSetting } from './Settings.jsx';
import { FACE_GESTURES, FACE_ACTIONS } from '../shared/headpose.js';

const A11Y_DEFAULTS = { dwell: 0, switchKey: 'F9', scanMs: 1200, keyboardLayout: 'en', keyboardSize: 1 };
const SOS_DEFAULTS = { contacts: [], phones: [], shareLocation: false, daily: { on: false, time: '20:00' }, name: '', note: '', checkin: { on: false, camera: false, hours: 3, from: '08:00', to: '22:00' }, medical: {} };
// Same fields as MEDICAL_FIELDS in services/sos.js (shown on the help sign, sent with the SOS email).
const MEDICAL = [['blood', 'Blood group', 'e.g. O+'], ['allergies', 'Allergies', 'e.g. Penicillin, peanuts, none'], ['conditions', 'Conditions', 'e.g. Diabetes, epilepsy, spinal injury'],
  ['medicines', 'Medicines', 'e.g. Insulin 10 units at 8 am'], ['doctor', 'Doctor', 'Name and phone']];
const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const COMMANDS = [
  ['Hey Maya', 'start talking (hands-free)'],
  ['show numbers → click 12', 'click anything by its number'],
  ['show grid → click D7', 'click anywhere on the screen'],
  ['scroll down / up', 'கீழே போ / மேலே போ'],
  ['type … / எழுது …', 'type what you say'],
  ['delete last word, new line', 'fix what you typed'],
  ['press enter, go back, copy, paste, undo', 'keys and shortcuts'],
  ['read the screen / திரையை படி', 'read it aloud; “read” again continues'],
  ['open keyboard / close keyboard', 'the on-screen keyboard'],
  ['start scanning → select', 'one-switch control'],
  ['help / உதவி / காப்பாத்து', 'emergency (10 s to cancel)'],
  ['cancel / வேண்டாம் / I’m okay', 'stop an emergency countdown'],
  ['what is this? / இது என்ன', 'says what is under the mouse or head pointer'],
  ['drag 3 to 7 / drag D4 to F6', 'drag and drop without a mouse'],
  ['again', 'repeat the last action (scroll, click, drag…)'],
  ['open Gmail / ChatGPT / WhatsApp', 'goes straight to your signed-in account in Chrome'],
  ['read my document DBMS notes', 'read a file aloud page by page'],
  ['next page / repeat / page 5 / stop reading', 'அடுத்த பக்கம் / மீண்டும்'],
  ['magnify / magnify less / stop magnifier', 'Windows Magnifier (பெரிதாக்கு)'],
  ['wait / I’m still working', '15 more minutes before a work-timer shutdown'],
  ['ask ChatGPT … / ask Claude …', 'types the question there and reads the answer'],
];

/** Everything for people with physical disabilities in one place: voice-only use, head mouse, keyboard, switch, emergency, display. */
export default function Accessibility() {
  const [a11y, setA11y] = useSetting('a11y', A11Y_DEFAULTS);
  const [sos, setSos] = useSetting('sos', SOS_DEFAULTS);
  const [wakeWord, setWakeWord] = useSetting('wakeWord', true);
  const [language, setLanguage] = useSetting('listenLanguage', null);
  const [large, setLarge] = useSetting('a11yLarge', false);
  const [headSpeed, setHeadSpeed] = useSetting('headMouseSpeed', 1);
  const [contacts, setContacts] = useState('');
  const [phones, setPhones] = useState('');
  const [userTitle, setUserTitle] = useSetting('userTitle', 'boss');
  const [timer, setTimer] = useState(null);
  const [care, setCare] = useState([]);
  const [msg, setMsg] = useState(null);
  const [log, setLog] = useState([]);
  const a = { ...A11Y_DEFAULTS, ...a11y };
  const s = { ...SOS_DEFAULTS, ...sos, checkin: { ...SOS_DEFAULTS.checkin, ...sos?.checkin } };

  useEffect(() => { setContacts((sos?.contacts || []).join(', ')); }, [sos?.contacts?.join()]);
  useEffect(() => { setPhones((sos?.phones || []).join(', ')); }, [sos?.phones?.join()]);
  const refresh = () => {
    window.ather.tool('work_timer_status', {}).then(setTimer).catch(() => {});
    const today = new Date().toLocaleDateString('en-CA');
    window.ather.tool('reminders_query', { include_done: true }).then((r) => setCare(r.filter((x) => x.care && x.at.startsWith(today)))).catch(() => {});
  };
  useEffect(refresh, [msg]);
  useEffect(() => { window.ather.sosLog().then(setLog).catch(() => {}); }, [msg]);
  const setA = (patch) => setA11y({ ...a, ...patch });
  const setS = (patch) => setSos({ ...s, ...patch });
  // Head mouse settings take effect by reopening its window.
  const restartHeadMouse = async () => { await window.ather.headMouseSet(false); await window.ather.headMouseSet(true); };
  const saveContacts = () => setS({ contacts: contacts.split(/[,;\s]+/).filter((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) });
  const savePhones = () => setS({ phones: phones.split(/[,;]+/).map((p) => p.trim()).filter((p) => /^\+?[0-9][0-9 ()-]{2,19}$/.test(p)) });
  async function testCall() {
    if (!window.confirm(`Call ${s.phones[0]} now through Phone Link, as a test?`)) return;
    setMsg('Calling…');
    try { const r = await window.ather.sosTestCall(); setMsg(r.error ? `⚠ ${r.error}` : `📞 Calling ${r.calling}.`); } catch (e) { setMsg(`⚠ ${errText(e)}`); }
  }
  async function startTimer(minutes) {
    try { await window.ather.tool('work_timer_start', { minutes, task: 'work', shutdown: true }); } catch (e) { setMsg(`⚠ ${errText(e)}`); }
    refresh();
  }
  async function testEmail() {
    setMsg('Sending a test email…');
    try { const r = await window.ather.sosTest(); setMsg(r.error ? `⚠ ${r.error}` : `✓ Test email sent to ${r.sent} caregiver${r.sent > 1 ? 's' : ''}.`); } catch (e) { setMsg(`⚠ ${errText(e)}`); }
  }

  return (
    <>
      <h1 className="page-title">Accessibility</h1>
      <p className="page-sub">Use your computer without your hands: by voice, by moving your head, or with a single switch. And get help fast in an emergency.</p>

      <div className="grid a11y-grid">
        <section className="panel" aria-labelledby="a11y-voice">
          <h2 id="a11y-voice">🗣 Voice only</h2>
          <label className="row field"><input type="checkbox" className="check" checked={wakeWord} onChange={(e) => setWakeWord(e.target.checked)} />
            Always listen for “Hey Maya” (no button needed)</label>
          <div className="field"><label htmlFor="a11y-lang">Language you speak</label>
            <select id="a11y-lang" className="input" value={language || ''} onChange={(e) => setLanguage(e.target.value || null)}>
              <option value="">Detect automatically</option><option value="english">English</option><option value="tamil">Tamil (தமிழ்)</option><option value="hindi">Hindi</option>
            </select>
          </div>
          <table className="cmds"><tbody>{COMMANDS.map(([say, what]) => <tr key={say}><td><b>{say}</b></td><td className="muted">{what}</td></tr>)}</tbody></table>
        </section>

        <section className="panel" aria-labelledby="a11y-head">
          <h2 id="a11y-head">🙂 Head mouse</h2>
          <p className="muted">The webcam follows your head to move the pointer. Open your mouth to click, smile to right-click. Video never leaves this PC. <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd></p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => window.ather.headMouseSet(true)}>Turn on</button>
            <button className="btn" onClick={() => window.ather.headMouseSet(false)}>Turn off</button>
          </div>
          <label className="field">Speed: {headSpeed}×
            <input type="range" min="0.5" max="2" step="0.1" value={headSpeed} onChange={(e) => setHeadSpeed(Number(e.target.value))} onMouseUp={restartHeadMouse} aria-label="Head mouse speed" /></label>
          <label className="row field"><input type="checkbox" className="check" checked={a.dwell > 0} onChange={(e) => setA({ dwell: e.target.checked ? 1000 : 0 })} />
            Dwell click: hold the pointer still to click (no mouth movement needed)</label>
          <label className="row field"><input type="checkbox" className="check" checked={!!a.blink} onChange={(e) => { setA({ blink: e.target.checked }); setTimeout(restartHeadMouse, 300); }} />
            Blink to click: close both eyes for half a second to click, 1.5 seconds to right-click (normal blinks are ignored)</label>
          {a.dwell > 0 && <label className="field">Hold still for {(a.dwell / 1000).toFixed(1)} s
            <input type="range" min="500" max="3000" step="100" value={a.dwell} onChange={(e) => setA({ dwell: Number(e.target.value) })} onMouseUp={restartHeadMouse} aria-label="Dwell time" /></label>}
          <details className="field">
            <summary>😉 Face gestures: more actions without your hands</summary>
            <p className="muted">Hold the face for a moment to act. Leave a gesture on “Nothing” if it happens by accident.</p>
            <div className="medical-grid">
              {FACE_GESTURES.map(([k, label]) => (
                <div className="field" key={k}><label htmlFor={`fg-${k}`}>{label}</label>
                  <select id={`fg-${k}`} className="input" value={a.faceActions?.[k] || 'none'}
                    onChange={(e) => { setA({ faceActions: { ...a.faceActions, [k]: e.target.value } }); setTimeout(restartHeadMouse, 300); }}>
                    {FACE_ACTIONS.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
                  </select></div>
              ))}
            </div>
          </details>
        </section>

        <section className="panel" aria-labelledby="a11y-kb">
          <h2 id="a11y-kb">⌨ On-screen keyboard</h2>
          <p className="muted">Big keys you can press with the head mouse, dwell clicks or a switch. Word suggestions learn your words (never passwords). Say “open keyboard”.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => window.ather.keyboardSet(true)}>Open keyboard</button>
            <button className="btn" onClick={() => window.ather.keyboardSet(false)}>Close</button>
          </div>
          <div className="row wrap">
            <div className="field" style={{ flex: 1 }}><label htmlFor="kb-l">Starts in</label>
              <select id="kb-l" className="input" value={a.keyboardLayout} onChange={(e) => setA({ keyboardLayout: e.target.value })}><option value="en">English</option><option value="ta">தமிழ்</option></select></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="kb-s">Size</label>
              <select id="kb-s" className="input" value={a.keyboardSize} onChange={(e) => setA({ keyboardSize: Number(e.target.value) })}><option value="1">Normal</option><option value="1.2">Large</option><option value="1.4">Extra large</option></select></div>
          </div>
        </section>

        <section className="panel" aria-labelledby="a11y-switch">
          <h2 id="a11y-switch">🔘 Switch scanning</h2>
          <p className="muted">For one button or one word: groups of controls light up in turn; press your switch (or say “select”) when the right one is lit, then again for the control. A mouth-open “click” in the head mouse works as the switch too.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => window.ather.voiceCommand({ cmd: 'scan', on: true })}>Start scanning</button>
            <button className="btn" onClick={() => window.ather.voiceCommand({ cmd: 'scan', on: false })}>Stop</button>
          </div>
          <div className="row wrap">
            <div className="field" style={{ flex: 1 }}><label htmlFor="sw-k">Switch key</label>
              <select id="sw-k" className="input" value={a.switchKey} onChange={(e) => setA({ switchKey: e.target.value })}>{['F8', 'F9', 'F10', 'F12', 'Scrolllock'].map((k) => <option key={k}>{k}</option>)}</select></div>
            <label className="field" style={{ flex: 1 }}>Speed: {(a.scanMs / 1000).toFixed(1)} s each
              <input type="range" min="600" max="3000" step="100" value={a.scanMs} onChange={(e) => setA({ scanMs: Number(e.target.value) })} aria-label="Scanning speed" /></label>
          </div>
          <div className="row wrap">
            <div className="field" style={{ flex: 2 }}><label htmlFor="sw-n">👄 Mouth sound as the switch (a lip pop or tongue click)</label>
              <select id="sw-n" className="input" value={a.noiseSwitch || 'off'} onChange={(e) => setA({ noiseSwitch: e.target.value })}>
                <option value="off">Off</option>
                <option value="scan">Switch (scan, then select)</option>
                <option value="click">Click at the pointer</option>
              </select></div>
            <div className="field" style={{ flex: 1 }}><label htmlFor="sw-ns">Sensitivity</label>
              <select id="sw-ns" className="input" value={a.noiseSensitivity || 'normal'} onChange={(e) => setA({ noiseSensitivity: e.target.value })} disabled={(a.noiseSwitch || 'off') === 'off'}>
                <option value="low">Low (noisy room)</option><option value="normal">Normal</option><option value="high">High (quiet pops)</option>
              </select></div>
          </div>
          {(a.noiseSwitch || 'off') !== 'off' && <p className="muted">Talking, coughing and music are ignored: only a short, sharp sound after a moment of quiet counts. The microphone sound stays on this PC.</p>}
        </section>

        <section className="panel sos-panel" aria-labelledby="a11y-sos">
          <h2 id="a11y-sos">🆘 Emergency help</h2>
          <p className="muted">Say “help” or “உதவி”, press SOS on the keyboard, or the button below: after 10 seconds (time to say “cancel”) a loud alarm sounds, a big “I need help” sign fills the screen, and your caregivers get an email. Uses the email account connected in Inbox.</p>
          <div className="row wrap">
            <div className="field" style={{ flex: 1 }}><label htmlFor="sos-n">Your name</label>
              <input id="sos-n" className="input" value={s.name} onChange={(e) => setS({ name: e.target.value })} placeholder="e.g. Ronald" /></div>
            <div className="field" style={{ flex: 2 }}><label htmlFor="sos-c">Caregiver emails (comma between)</label>
              <input id="sos-c" className="input" value={contacts} onChange={(e) => setContacts(e.target.value)} onBlur={saveContacts} placeholder="amma@example.com, friend@example.com" /></div>
          </div>
          <div className="field"><label htmlFor="sos-p">Emergency phone number (called first) — your phone must be paired in Windows Phone Link</label>
            <input id="sos-p" className="input" type="tel" value={phones} onChange={(e) => setPhones(e.target.value)} onBlur={savePhones} placeholder="+91 98765 43210" /></div>
          <div className="field"><label htmlFor="sos-note">Note for them (medicine, door key, doctor's number…)</label>
            <input id="sos-note" className="input" value={s.note} onChange={(e) => setS({ note: e.target.value })} /></div>
          <fieldset className="medical-id">
            <legend>🩺 Medical ID</legend>
            <p className="muted small-print">Shown on the help sign and sent to your caregivers in an emergency. You can also say “my blood group is O positive”.</p>
            <div className="medical-grid">
              {MEDICAL.map(([k, label, hint]) => (
                <div className="field" key={k}><label htmlFor={`med-${k}`}>{label}</label>
                  <input id={`med-${k}`} className="input" value={s.medical?.[k] || ''} placeholder={hint} onChange={(e) => setS({ medical: { ...s.medical, [k]: e.target.value } })} /></div>
              ))}
            </div>
          </fieldset>
          <label className="row field"><input type="checkbox" className="check" checked={!!s.shareLocation} onChange={(e) => setS({ shareLocation: e.target.checked })} />
            Add my approximate location to the emergency email (from the internet connection; only when help is asked for)</label>
          <label className="row field"><input type="checkbox" className="check" checked={!!s.daily?.on} onChange={(e) => setS({ daily: { ...SOS_DEFAULTS.daily, ...s.daily, on: e.target.checked } })} />
            Send my caregivers a daily “I’m okay” update at
            <input className="input" type="time" style={{ width: 110 }} value={s.daily?.time || '20:00'} onChange={(e) => setS({ daily: { ...SOS_DEFAULTS.daily, ...s.daily, time: e.target.value } })} aria-label="Daily update time" />
            (medicines taken or missed, how the day went)</label>
          <label className="row field"><input type="checkbox" className="check" checked={s.checkin.on} onChange={(e) => setS({ checkin: { ...s.checkin, on: e.target.checked } })} />
            Check on me: if I am quiet for
            <select className="input" style={{ width: 90 }} value={s.checkin.hours} onChange={(e) => setS({ checkin: { ...s.checkin, hours: Number(e.target.value) } })} aria-label="Hours">{[1, 2, 3, 4, 6].map((h) => <option key={h} value={h}>{h} h</option>)}</select>
            between <input className="input" type="time" style={{ width: 110 }} value={s.checkin.from} onChange={(e) => setS({ checkin: { ...s.checkin, from: e.target.value } })} aria-label="From" />
            and <input className="input" type="time" style={{ width: 110 }} value={s.checkin.to} onChange={(e) => setS({ checkin: { ...s.checkin, to: e.target.value } })} aria-label="To" />, ask “Are you okay?”</label>
          {s.checkin.on && <label className="row field"><input type="checkbox" className="check" checked={!!s.checkin.camera} onChange={(e) => setS({ checkin: { ...s.checkin, camera: e.target.checked } })} />
            Also use the webcam: if it sees me, I am not “quiet” (one look every 10 minutes, checked on this PC and never saved)</label>}
          <div className="row wrap">
            <button className="btn danger big-sos" onClick={() => window.ather.sosTrigger('pressed the help button')}>🆘 Get help now</button>
            <button className="btn" onClick={testEmail} disabled={!s.contacts.length}>Send a test email</button>
            <button className="btn" onClick={testCall} disabled={!s.phones.length}>Test call</button>
          </div>
          {msg && <p className="muted" role="status">{msg}</p>}
          {!!log.length && <details><summary className="muted">Recent alerts</summary><ul className="list">{log.slice(0, 6).map((l, i) => <li className="item" key={i}><span className="badge">{new Date(l.at).toLocaleString()}</span><span className="item-title">{l.event}: {l.reason}{l.sent ? ` · emailed ${l.sent}` : ''}{l.calling ? ` · called ${l.calling}` : ''}{l.error ? ` · ${l.error}` : ''}</span></li>)}</ul></details>}
        </section>

        <section className="panel" aria-labelledby="a11y-timer">
          <h2 id="a11y-timer">⏳ Work timer</h2>
          <p className="muted">Say “I will work for 2 hours, then shut down”. When time is up Maya tells you how your day went, says goodbye and shuts the PC down after one minute — say “wait” for 15 more minutes.</p>
          {timer?.running ? (
            <div className="row wrap"><span>Until <b>{new Date(timer.ends).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b> ({timer.minutes_left} min left){timer.shutdown ? ', then shut down' : ''}</span>
              <button className="btn" onClick={() => window.ather.tool('work_timer_cancel', {}).then(refresh)}>Stop timer</button></div>
          ) : (
            <div className="row wrap">{[60, 120, 180].map((m) => <button key={m} className="btn" onClick={() => startTimer(m)}>{m / 60} h, then shut down</button>)}</div>
          )}
          <div className="field"><label htmlFor="a11y-title">Maya calls you</label>
            <input id="a11y-title" className="input" value={userTitle} onChange={(e) => setUserTitle(e.target.value)} placeholder="sir, madam, or your name" /></div>
        </section>

        <section className="panel" aria-labelledby="a11y-care">
          <h2 id="a11y-care">💊 Medicine and care</h2>
          <p className="muted">Say “remind me to take my tablets at 9 pm every day”. Maya asks you to say “done”; if you don't within 15 minutes, your caregivers get an email.</p>
          {!care.length && <p className="empty">No medicine reminders today.</p>}
          <ul className="list">{care.map((r) => <li className="item" key={r.id}><span className="item-title">💊 {r.text}</span>
            <span className={`badge ${!r.confirmed_at && r.fired_at ? 'late' : ''}`}>{r.confirmed_at ? '✓ done' : r.fired_at ? 'not confirmed yet' : r.at.slice(11, 16)}</span></li>)}</ul>
        </section>

        <section className="panel" aria-labelledby="a11y-display">
          <h2 id="a11y-display">🔍 Display</h2>
          <label className="row field"><input type="checkbox" className="check" checked={large} onChange={(e) => setLarge(e.target.checked)} />
            Large and high contrast: bigger text and buttons, stronger outlines</label>
          <div className="row wrap">
            <button className="btn" onClick={() => window.ather.voiceCommand({ cmd: 'magnify', action: 'in' })}>🔍 Magnifier on / more</button>
            <button className="btn" onClick={() => window.ather.voiceCommand({ cmd: 'magnify', action: 'off' })}>Magnifier off</button>
          </div>
          <p className="muted">Theme, face shape, colours and how lively the face is: Settings → Appearance.</p>
        </section>
      </div>
    </>
  );
}
