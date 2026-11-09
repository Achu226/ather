import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import Face from './shared/Face.jsx';
import ToolResult from './shared/ToolResult.jsx';
import Markdown from './shared/Markdown.jsx';
import Approvals, { approvalTitle } from './shared/Approvals.jsx';
import LockScreen, { useLocked } from './shared/LockScreen.jsx';
import { useAsk } from './shared/useAsk.js';
import { startRecording, playSpeech, stopSpeech, chime } from './shared/audio.js';
import { listenOnce, watchForInterrupt, isStopPhrase, matchWake, greeting, nextSentence } from './shared/voice.js';
import { detectEmotion, afterFeeling } from './shared/emotion.js';
import { parseCommand, parseYesNo } from './shared/voicecommands.js';
import { workMood } from './shared/work.js';
import './shared/base.css';
import './notch.css';

const ather = window.ather;
const errText = (e) => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const SELECTION_ACTIONS = [
  ['Explain', 'Explain this simply'],
  ['Summarise', 'Summarise this in a few bullet points'],
  ['Translate', 'Translate this to English (or to Hindi if it is already English)'],
  ['Fix grammar', 'Fix the grammar and spelling of this, keep the meaning, and give only the corrected text'],
  ['Reply', 'Write a short, polite reply to this message'],
];

/** Five bars that follow the voice level (0..1). */
function Wave({ level }) {
  const shape = [0.55, 0.85, 1, 0.85, 0.55];
  return <div className="wave" aria-hidden>{shape.map((s, i) => <span key={i} style={{ height: `${4 + level * s * 22 * (0.8 + Math.random() * 0.4)}px` }} />)}</div>;
}

function Notch() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [mood, setMood] = useState('idle');
  const [look, setLook] = useState(0);
  const [mouth, setMouth] = useState(0);
  const [recording, setRecording] = useState(null); // 'ask' | 'dictate' | null
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState(null); // { title, body }
  const [faceMode, setFaceMode] = useState('face');
  const [speakAlways, setSpeakAlways] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceMode, setVoiceMode] = useState(null); // null | 'listening' | 'thinking' | 'speaking'
  const [selection, setSelection] = useState(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [wakeOn, setWakeOn] = useState(false);
  const [control, setControl] = useState(null); // task text while Maya controls the PC
  const [clips, setClips] = useState(null); // clipboard history picker (Ctrl+Shift+V)
  const locked = useLocked();
  const { turn, send, cancel, reset } = useAsk();
  const turnText = useRef(''); // the answer as it streams, for speaking sentence by sentence
  turnText.current = turn?.text || '';
  const recorder = useRef(null);
  const recMode = useRef(null); // 'ask' | 'dictate' | 'write' while the mic records
  const [timers, setTimers] = useState([]);
  const [, tick] = useState(0); // redraws the timer badge every second
  useEffect(() => ather.onTimers(setTimers), []);
  useEffect(() => { if (!timers.length) return undefined; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [timers.length]);
  const left = (ends) => { const s = Math.max(0, Math.round((ends - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const pttHeld = useRef(false); // the Right Ctrl / Right Alt talk key is held down
  const card = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const moodTimer = useRef(null);
  const voiceAbort = useRef(null);

  const thinking = !!turn?.thinking || transcribing;
  const busy = thinking || !!recording || speaking || !!voiceMode || !!selection || !!clips || approvalPending || !!input || images.length > 0;

  const flash = (m, ms = 2500) => {
    setMood(m);
    clearTimeout(moodTimer.current);
    moodTimer.current = setTimeout(() => setMood('idle'), ms);
  };

  // ---- window wiring ----
  useEffect(() => {
    ather.getSetting('faceMode', 'face').then(setFaceMode);
    ather.getSetting('speakAlways', false).then(setSpeakAlways);
    ather.getSetting('wakeWord', true).then(setWakeOn);
    const offs = [
      ather.onExpand(({ focus }) => { setExpanded(true); woke(); if (focus) setTimeout(() => inputRef.current?.focus(), 50); }),
      ather.onLook(setLook),
      // Something finished (a workflow, a Builder job): a little celebration.
      ather.onWorkflowRun((run) => { if (run.status === 'completed') flash('celebrate', 2600); }),
      ather.onCollapse(() => setExpanded(false)),
      ather.onSettingsChanged((key, value) => {
        if (key === 'faceMode') setFaceMode(value);
        if (key === 'speakAlways') setSpeakAlways(value);
        if (key === 'wakeWord') setWakeOn(value);
      }),
      ather.onNotify(async ({ title, body, kind, id }) => {
        chime();
        setNotice({ title, body });
        flash('surprised', 1200);
        setTimeout(() => flash('happy', 3000), 1200);
        setTimeout(() => setNotice(null), 12000);
        await say(`${title}. ${body}`);
        // Medicine: listen for "done" (a caregiver is emailed if nobody confirms within 15 minutes).
        if (kind !== 'care') return;
        for (let tries = 0; tries < 3; tries++) {
          const audio = await listenOnce(new AbortController().signal, setMicLevel).catch(() => null);
          setMicLevel(0);
          if (!audio) continue;
          const heard = await ather.transcribe(audio).catch(() => '');
          if (parseYesNo(heard) || /\b(done|taken|took it|finished)\b|எடுத்துட்டேன்|முடிஞ்சது|சாப்பிட்டேன்/i.test(heard)) {
            await ather.careDone(id);
            flash('nod', 1200);
            say('Great, noted.');
            return;
          }
        }
      }),
      ather.onFacePlay(({ name, message }) => {
        flash(name, 3500);
        if (message) { setNotice({ title: 'Maya', body: message }); setTimeout(() => setNotice(null), 6000); }
      }),
      ather.onDictateStart(() => startMic('dictate')),
      ather.onDictateStop(() => stopMic()),
      ather.onInterpreter((lang) => (lang ? startInterpreter(lang) : stopVoiceMode())),
      // Hold Right Ctrl (command) / Right Alt (dictate); letting go before the mic is ready still stops it.
      ather.onPtt(async ({ mode, phase }) => {
        if (phase === 'start') {
          pttHeld.current = true;
          await startMic(mode === 'command' ? 'ask' : 'dictate');
          if (!pttHeld.current) stopMic();
        } else {
          pttHeld.current = false;
          if (phase === 'end') stopMic(); else discardMic();
        }
      }),
      ather.onComputer(({ active, task }) => setControl(active ? task : null)),
      ather.onAttach((url) => {
        reset();
        setImages([url]);
        setExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 80);
      }),
      ather.onClipboard((items) => { reset(); setSelection(null); setClips(items); }),
      ather.onSelection((text) => {
        reset();
        if (text) setSelection(text);
        else { setNotice({ title: 'Nothing selected', body: 'Select some text in any app, then press Ctrl+Shift+E.' }); setTimeout(() => setNotice(null), 5000); }
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => { ather.setBusy(busy); }, [busy]);
  useEffect(() => {
    if (!card.current) return;
    const ro = new ResizeObserver(() => ather.setHeight(card.current.getBoundingClientRect().bottom));
    ro.observe(card.current);
    return () => ro.disconnect();
  }, [expanded]);
  useEffect(() => { if (thinking) setMood((m) => (m === 'worried' || m === 'sad' || m === 'excited' || m === 'angry' ? m : 'think')); }, [thinking]);
  // A tool is running (adding a task, drawing, searching…): show the working face.
  useEffect(() => { if (turn?.thinking && turn.tools.length) setMood(workMood(turn.tools.at(-1).name)); }, [turn?.tools.length]);
  // Music started: Maya grooves along for a bit.
  useEffect(() => { if (turn && !turn.thinking && turn.tools.some((t) => t.name === 'music_play' && t.result?.playing)) flash('groove', 15000); }, [turn?.thinking]);
  // Finishing something (a task done, a habit kept, a focus session, a commit, a website published) earns confetti.
  useEffect(() => {
    if (turn && !turn.thinking && turn.tools.some((t) => /^(tasks_complete|habits_checkin|focus_stop|routines_run|git_commit|github_publish)$/.test(t.name) && !t.result?.error && !t.result?.denied)) flash('celebrate', 2600);
  }, [turn?.thinking]);

  // ---- asleep after a long quiet time; a stretch on waking ----
  const lastActive = useRef(Date.now());
  function woke() {
    lastActive.current = Date.now();
    setMood((m) => (m === 'sleep' ? 'wake' : m));
    setTimeout(() => setMood((m) => (m === 'wake' ? 'idle' : m)), 1100);
  }
  useEffect(() => {
    const t = setInterval(() => setMood((m) => (m === 'idle' && Date.now() - lastActive.current > 10 * 60_000 ? 'sleep' : m)), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (busy) woke(); }, [busy]);

  // Live microphone level for the waveform during push-to-talk.
  const [micLevel, setMicLevel] = useState(0);
  useEffect(() => {
    if (!recording) { setMicLevel(0); return; }
    let raf;
    const tick = () => { setMicLevel(Math.min(1, (recorder.current?.level() || 0) * 8)); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [recording]);

  // ---- speaking ----
  async function say(text, { interruptible = false } = {}) {
    if (!text) return false;
    let interrupted = false;
    let stopWatch = null;
    try {
      const audio = await ather.speak(text);
      if (!audio) return false;
      setSpeaking(true);
      if (interruptible) stopWatch = await watchForInterrupt(() => { interrupted = true; stopSpeech(); });
      await playSpeech(audio, setMouth);
    } catch { /* voice model missing: the answer is still on screen */ } finally {
      stopWatch?.();
      setSpeaking(false);
    }
    return interrupted;
  }

  // ---- asking ----
  async function submit(text, viaVoice = false) {
    const q = text.trim();
    if (!q && !images.length) return null;
    stopSpeech();
    setInput('');
    setSelection(null);
    const pics = images;
    setImages([]);
    // React to how the user feels first (tense when overwhelmed, sad, excited…), then think.
    const feeling = detectEmotion(q);
    if (feeling) setMood(feeling);
    const answer = await send(q || 'What is in this picture?', pics, { style: 'short' });
    if (answer === null) { flash('error'); return null; }
    flash(afterFeeling(feeling), 3500);
    if (viaVoice || speakAlways) say(answer);
    return answer;
  }

  // ---- "Hey Maya": listen in the background while idle, start voice mode on the wake word ----
  useEffect(() => {
    if (!wakeOn || voiceMode || recording || locked) return;
    const controller = new AbortController();
    (async () => {
      while (!controller.signal.aborted) {
        const audio = await listenOnce(controller.signal).catch(() => null);
        if (controller.signal.aborted) return;
        if (!audio || audio.length > 16000 * 4) continue; // wake phrases are short
        const rest = matchWake(await ather.transcribeQuick(audio).catch(() => ''), (await ather.getSetting('agent', {}))?.name || '');
        if (rest === null) continue;
        controller.abort();
        setExpanded(true);
        woke();
        flash('wake', 1100);
        // Just "Hey Maya": greet like a personal assistant, then listen for the work.
        if (rest.split(/\s+/).filter(Boolean).length < 2) await say(greeting(new Date(), await ather.getSetting('userTitle', 'boss')));
        startVoiceMode(rest.split(/\s+/).length >= 2 ? rest : null);
      }
    })();
    return () => controller.abort();
  }, [wakeOn, voiceMode, recording, locked]);

  // ---- approvals by voice: someone who can only speak cannot click Allow ----
  const wakeRef = useRef(false);
  wakeRef.current = wakeOn;
  useEffect(() => ather.onApprovalRequest(async (r) => {
    if (!voiceAbort.current && !wakeRef.current) return; // typing users click the card
    setMood('ask');
    // An email is read out before "yes": someone who only speaks cannot read the card.
    const body = /^mail_(send|reply)$/.test(r.name) && r.args?.text ? ` It says: ${r.args.text}.` : '';
    await say(`${approvalTitle(r)}${body} Say yes or no.`);
    for (let tries = 0; tries < 3; tries++) {
      const audio = await listenOnce(new AbortController().signal, setMicLevel).catch(() => null);
      setMicLevel(0);
      if (!audio) continue;
      const yes = parseYesNo(await ather.transcribe(audio).catch(() => ''));
      if (yes === null) { await say('Please say yes or no.'); continue; }
      ather.answerApproval(r.id, yes);
      flash(yes ? 'nod' : 'idle', 900);
      return;
    }
  }), []);

  // ---- emergency: the face shows it, and Maya listens for "cancel" even outside voice mode ----
  const sosState = useRef(null);
  useEffect(() => ather.onSos(async (s) => {
    sosState.current = s.state;
    if (s.state === 'countdown') {
      setMood('sos');
      setExpanded(true);
      await say(s.reason?.startsWith('did not answer') ? 'Are you okay? Say "I am okay", or I will call for help.' : `Getting help in ${s.seconds} seconds. Say cancel if you are okay.`);
      if (voiceAbort.current) return; // voice mode is already listening and handles "cancel"
      while (sosState.current === 'countdown') {
        const audio = await listenOnce(new AbortController().signal, setMicLevel).catch(() => null);
        setMicLevel(0);
        if (!audio || sosState.current !== 'countdown') continue;
        if (parseCommand(await ather.transcribe(audio).catch(() => ''))?.cmd === 'cancel') await ather.sosCancel();
      }
    } else if (s.state === 'alarm') setMood('sos');
    else if (s.state === 'cancelled') flash('happy', 2500);
    else setMood('idle');
  }), []);

  // ---- work timer over: summary, goodbye, and a minute to say "wait" before the PC shuts down ----
  const [goodbye, setGoodbye] = useState(null);
  const sessionState = useRef(null);
  useEffect(() => ather.onSession(async (s) => {
    sessionState.current = s.state;
    if (s.state === 'done') { setExpanded(true); flash('happy', 4000); await say(`Your ${s.task} time is over. ${s.summary} Well done, ${s.title}!`); return; }
    if (s.state !== 'goodbye') { setGoodbye(null); if (s.state === 'off') flash('happy', 1500); return; }
    setGoodbye(s);
    setExpanded(true);
    flash('sleepy', 6000);
    await say(`${s.summary} Bye ${s.title}, have a great day! I will shut down the computer in ${s.seconds} seconds. Say wait if you are still working.`);
    if (voiceAbort.current) return; // voice mode is already listening and handles "wait" / "cancel"
    while (sessionState.current === 'goodbye') {
      const audio = await listenOnce(new AbortController().signal, setMicLevel).catch(() => null);
      setMicLevel(0);
      if (!audio || sessionState.current !== 'goodbye') continue;
      const c = parseCommand(await ather.transcribe(audio).catch(() => ''));
      if (c?.cmd === 'later' || c?.cmd === 'cancel') { const r = await ather.voiceCommand(c).catch(() => null); if (r?.said) say(r.said); }
    }
  }), []);

  // ---- hands-free voice mode ----
  async function startVoiceMode(firstQuestion = null) {
    if (voiceAbort.current) return;
    stopSpeech();
    const controller = new AbortController();
    voiceAbort.current = controller;
    setNotice({ title: 'Voice mode', body: 'Just talk. Say "stop" or press 🎧 to finish.' });
    setTimeout(() => setNotice(null), 5000);
    let pending = firstQuestion;
    let lastQuestion = ''; // for "good / bad answer"
    try {
      while (!controller.signal.aborted) {
        let text = pending;
        pending = null;
        if (!text) {
          setVoiceMode('listening');
          setMood('listen');
          const audio = await listenOnce(controller.signal, setMicLevel);
          setMicLevel(0);
          if (controller.signal.aborted) break;
          if (!audio) continue;
          setVoiceMode('thinking');
          setMood('think');
          text = await ather.transcribe(audio);
        }
        if (!text) continue;
        ather.voiceHeard();
        // "show numbers", "click 5", "help", "read the screen", "type …": done at once, no AI needed.
        // Commands come before "stop": while an alarm counts down, "stop" / "cancel" must cancel the alarm.
        const command = parseCommand(text);
        // "Good answer" / "bad answer": a bad one asks what to change, and Maya follows that from now on.
        if (command?.cmd === 'feedback') {
          let note = '';
          if (!command.good) {
            await say('Sorry. What should I do differently?');
            const audio = await listenOnce(controller.signal, setMicLevel).catch(() => null);
            setMicLevel(0);
            note = audio ? await ather.transcribe(audio).catch(() => '') : '';
          }
          await ather.feedback({ question: lastQuestion, good: command.good, note });
          flash(command.good ? 'happy' : 'nod', 1500);
          await say(command.good ? 'Thank you!' : note ? 'Got it, I will remember that.' : 'Okay.');
          continue;
        }
        if (command) {
          const r = await ather.voiceCommand(command).catch((e) => ({ error: errText(e) }));
          if (!r.pass) {
            if (r.error) { flash('error', 1500); await say(r.error); }
            else if (r.read) { setVoiceMode('speaking'); await say(r.read, { interruptible: true }); }
            else { chime(); flash('nod', 900); }
            continue;
          }
        }
        if (isStopPhrase(text)) break;
        setVoiceMode('thinking');
        const feeling = detectEmotion(text);
        setMood(feeling || 'think');
        lastQuestion = text;
        // Talk while thinking (like a person, or NVIDIA PersonaPlex): each finished sentence is spoken as soon as it
        // is written; talking over Maya stops her at once and she listens again.
        let spoken = 0, cutIn = false, done = false;
        const asking = send(text, [], { style: 'short' }).finally(() => { done = true; });
        while (!cutIn && !controller.signal.aborted) {
          const sentence = nextSentence(turnText.current, spoken);
          if (sentence) { spoken = sentence.end; setVoiceMode('speaking'); cutIn = await say(sentence.text, { interruptible: true }); continue; }
          if (done) break;
          await new Promise((r) => setTimeout(r, 120));
        }
        if (cutIn) { cancel(); continue; }
        const answer = await asking;
        if (answer === null || controller.signal.aborted) continue;
        flash(afterFeeling(feeling), 3500);
        const left = answer.length > spoken ? answer.slice(spoken).trim() : '';
        if (left) { setVoiceMode('speaking'); await say(left, { interruptible: true }); }
      }
    } catch (err) {
      setNotice({ title: 'Voice mode', body: errText(err) });
    } finally {
      voiceAbort.current = null;
      setVoiceMode(null);
      setMood('idle');
    }
  }
  const stopVoiceMode = () => { voiceAbort.current?.abort(); stopSpeech(); };

  /** Interpreter mode: each sentence heard is said aloud in the other language, until "stop" (or 🎧). */
  async function startInterpreter(lang) {
    if (voiceAbort.current) stopVoiceMode();
    const controller = new AbortController();
    voiceAbort.current = controller;
    setNotice({ title: 'Interpreter', body: 'Each person just talks; I say it in the other language. Say "stop" to end.' });
    try {
      while (!controller.signal.aborted) {
        setVoiceMode('listening');
        setMood('listen');
        const audio = await listenOnce(controller.signal, setMicLevel);
        setMicLevel(0);
        if (controller.signal.aborted) break;
        if (!audio) continue;
        setVoiceMode('thinking');
        setMood('think');
        const turn = await ather.interpretTurn(audio, lang);
        if (!turn) continue;
        if (isStopPhrase(turn.heard) || /^\s*(நிறுத்து|बंद करो|रुको)\s*[.!]?\s*$/.test(turn.heard)) break;
        setNotice({ title: turn.to === 'en' ? 'In English' : 'Translated', body: `${turn.heard}\n→ ${turn.said}` });
        setVoiceMode('speaking');
        setMood('happy');
        await say(turn.said);
      }
    } catch (err) {
      setNotice({ title: 'Interpreter', body: errText(err) });
    } finally {
      if (voiceAbort.current === controller) voiceAbort.current = null;
      setVoiceMode(null);
      setMood('idle');
    }
  }

  // ---- push-to-talk microphone ----
  async function startMic(mode) {
    if (recorder.current) return;
    stopSpeech();
    try {
      recorder.current = await startRecording();
      recMode.current = mode; // listeners registered once would otherwise read a stale `recording`
      setRecording(mode);
      setMood('listen');
    } catch {
      setNotice({ title: 'Microphone', body: 'Maya could not use the microphone. Check Windows Settings → Privacy → Microphone.' });
    }
  }

  async function stopMic() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    const mode = recMode.current || recording || 'dictate';
    setRecording(null);
    setMood('think');
    const audio = await rec.stop();
    if (audio.length < 16000 * 0.3) { setMood('idle'); return; } // under 0.3 s: nothing said
    setTranscribing(true);
    try {
      if (mode === 'dictate') {
        const typed = await ather.dictationResult(audio);
        setNotice(typed ? { title: 'Typed', body: typed } : { title: 'Dictation', body: 'I did not catch that.' });
        setTimeout(() => setNotice(null), 4000);
        flash(typed ? 'happy' : 'sad');
      } else {
        const text = await ather.transcribe(audio);
        setTranscribing(false);
        // The pen: what was said is what to write, typed where the user's cursor was.
        if (text) submit(mode === 'write' && !/^\s*write\b/i.test(text) ? `Write ${text}` : text, true); else flash('sad');
      }
    } catch (err) {
      setNotice({ title: 'Listening', body: errText(err) });
      flash('sad');
    } finally {
      setTranscribing(false);
    }
  }

  /** Another key was pressed while holding the talk key: it was a shortcut, so throw the recording away. */
  async function discardMic() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setRecording(null);
    setMood('idle');
    await rec.stop();
  }

  const toggleMic = () => (recording ? stopMic() : startMic('ask'));

  async function openInChat() {
    ather.openApp(`chat:${await ather.notchConversation()}`);
    ather.collapse();
  }

  function addImageFiles(files) {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => setImages((imgs) => [...imgs, reader.result].slice(0, 3));
      reader.readAsDataURL(f);
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input); }
    if (e.key === 'Escape') { reset(); setSelection(null); setClips(null); stopVoiceMode(); ather.collapse(); }
  };

  // Glow colour follows the real state.
  const glow = recording || voiceMode === 'listening' ? 'listen'
    : speaking ? 'speaking'
      : mood === 'working' ? 'working'
        : thinking ? 'think'
          : ['happy', 'celebrate', 'excited', 'error'].includes(mood) ? mood : 'idle';

  const voiceLabel = { listening: 'Listening… just talk', thinking: 'Thinking…', speaking: 'Speaking… talk to interrupt' }[voiceMode];

  return (
    <div className={`notch ${expanded ? 'is-open' : ''}`}>
      {control && (
        <div className="peek peek-rec control-banner" role="status">
          <span>🖱 Maya is using your PC: {control.slice(0, 50)} · press Esc to stop</span>
        </div>
      )}
      {!expanded && !control && (
        <div className={`peek ${recording === 'dictate' || voiceMode ? 'peek-rec' : ''}`}>
          {recording === 'dictate' ? <span>● Listening… {pttHeld.current ? 'let go of Right Alt' : 'Ctrl+Shift+Space'} to type it</span>
            : voiceMode ? <span>🎧 {voiceLabel}</span>
              : <><i /><i />{wakeOn && <span className="ear" title='Listening for "Hey Maya"'>👂</span>}
                {timers[0] && <span className="timer-badge" title={timers[0].label || 'Timer'}>⏱ {left(timers[0].ends)}</span>}</>}
        </div>
      )}

      {expanded && locked && <div className="card" ref={card}><LockScreen compact /></div>}

      {expanded && !locked && (
        <div className="card" ref={card}>
          {faceMode === 'face' && (
            <div className={`face-wrap glow-${glow}`} onDoubleClick={() => ather.openApp('home')} title="Double-click to open Maya">
              <Face mood={mood} mouth={mouth} size={104} look={look} level={micLevel} />
            </div>
          )}
          {(recording || voiceMode === 'listening' || speaking) && <Wave level={speaking ? mouth : micLevel} />}

          {voiceMode && <div className="voice-status">🎧 {voiceLabel}</div>}

          {notice && (
            <div className="bubble notice">
              <b>{notice.title}</b> {notice.body}
            </div>
          )}

          {goodbye && (
            <div className="bubble notice" role="alertdialog" aria-label="Shutting down">
              <b>👋 Shutting down in a minute</b> {goodbye.summary}
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <button className="btn primary" onClick={() => ather.sessionExtend()}>I'm still working (+15 min)</button>
                <button className="btn" onClick={() => ather.sessionCancel()}>Don't shut down</button>
              </div>
            </div>
          )}

          {clips && (
            <div className="bubble">
              <div className="question">Copied earlier · click to paste</div>
              {!clips.length && <p className="muted">Nothing copied yet. Text you copy (not passwords) shows here until Maya closes.</p>}
              <ul className="clips">
                {clips.slice(0, 12).map((c, i) => (
                  <li key={i}><button className="clip" onClick={() => { setClips(null); ather.pasteClip(c.text); }} title={c.text.slice(0, 500)}>
                    {c.text.replace(/\s+/g, ' ').slice(0, 110)}{c.text.length > 110 ? '…' : ''}</button></li>
                ))}
              </ul>
              {!!clips.length && <button className="btn small" onClick={() => { ather.clearClipboard(); setClips([]); }}>Clear history</button>}
            </div>
          )}

          {selection && (
            <div className="bubble">
              <div className="question">Selected text</div>
              <div className="selection-text">{selection.slice(0, 400)}{selection.length > 400 ? '…' : ''}</div>
              <div className="selection-actions">
                {SELECTION_ACTIONS.map(([label, instruction]) => (
                  <button key={label} className="btn small" onClick={() => submit(`${instruction}:\n\n"""\n${selection.slice(0, 6000)}\n"""`)}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {turn && (
            <div className="bubble" aria-live="polite">
              <div className="question">{turn.question.includes('"""') ? turn.question.split(':')[0] : turn.question}</div>
              {turn.tools.map((t, i) => <ToolResult key={i} event={t} />)}
              {turn.text && <div className="answer"><Markdown text={turn.text} /></div>}
              {turn.thinking && !turn.text && <div className="dots"><span /><span /><span /></div>}
              {turn.error && <div className="chip chip-error">⚠ {turn.error}</div>}
              {!turn.thinking && turn.text && <button className="link continue" onClick={openInChat}>Continue in chat ↗</button>}
            </div>
          )}

          <Approvals onPending={setApprovalPending} />

          {images.length > 0 && (
            <div className="attachments">
              {images.map((src, i) => (
                <button key={i} className="thumb" onClick={() => setImages(images.filter((_, j) => j !== i))} title="Remove picture">
                  <img src={src} alt="Attached" />
                </button>
              ))}
            </div>
          )}

          <div className="input-row">
            <button className="icon-btn" onClick={() => fileRef.current.click()} title="Attach a picture" aria-label="Attach a picture">📎</button>
            <input type="file" accept="image/*" ref={fileRef} hidden onChange={(e) => { addImageFiles(e.target.files); e.target.value = ''; }} />
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              placeholder={recording ? 'Listening… click the mic when done' : transcribing ? 'Writing down what you said…' : 'Ask Maya anything…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              onPaste={(e) => addImageFiles(e.clipboardData.files)}
              aria-label="Message to Maya"
            />
            {thinking && !voiceMode
              ? <button className="icon-btn stop" onClick={cancel} title="Stop" aria-label="Stop">■</button>
              // "Hey Maya" is listening: no button to press (people who cannot click just speak).
              : wakeOn && !recording
                ? <span className="icon-btn wake-hint" role="status" title="Always listening: just say “Hey Maya”" aria-label="Always listening. Say Hey Maya.">👂</span>
                : <button className={`icon-btn mic ${recording === 'ask' ? 'rec' : ''}`} onClick={toggleMic} title={recording ? 'Stop listening' : 'Talk to Maya'} aria-label="Talk to Maya">🎤</button>}
            <button className={`icon-btn ${recording === 'write' ? 'rec' : ''}`} onClick={() => (recording ? stopMic() : startMic('write'))}
              title="Write: say what to write; Maya types a first draft where your cursor is" aria-label="Write for me">✏️</button>
            <button className={`icon-btn ${voiceMode ? 'voice-on' : ''}`} onClick={voiceMode ? stopVoiceMode : startVoiceMode}
              title={voiceMode ? 'End voice conversation' : 'Hands-free voice conversation'} aria-label="Voice mode" aria-pressed={!!voiceMode}>🎧</button>
            <button className="icon-btn" onClick={() => ather.openApp('home')} title="Open the Maya app" aria-label="Open the Maya app">⤢</button>
          </div>
          <div className="hint">{wakeOn ? 'Say “Hey Maya” any time' : 'Enter to send · 🎤 talk'} · 🎧 voice chat · Ctrl+Shift+E on selected text · Ctrl+Shift+V copied earlier · Ctrl+Shift+Space voice typing</div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Notch />);
