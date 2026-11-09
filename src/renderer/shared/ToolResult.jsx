import { fileUrl } from './audio.js';

const LABELS = {
  tasks_create: (a) => `Added task “${a.title}”`,
  tasks_complete: () => 'Marked task done',
  tasks_update: () => 'Updated task',
  tasks_delete: () => 'Deleted task',
  notes_create: (a) => `Saved note “${a.title}”`,
  notes_update: () => 'Updated note',
  notes_delete: () => 'Deleted note',
  reminders_create: (a) => `Reminder set: ${a.text}`,
  reminders_delete: () => 'Reminder cancelled',
  habits_create: (a) => `Tracking habit “${a.name}”`,
  habits_checkin: () => 'Habit checked in',
  habits_delete: () => 'Habit removed',
  focus_start: (a) => `Focus timer: ${a.minutes || 25} min`,
  focus_stop: () => 'Focus stopped',
  calendar_create: (a) => `Added to calendar: ${a.title}`,
  calendar_delete: () => 'Event deleted',
  app_undo: () => 'Undone',
  personality_set: (a) => `Personality: ${a.id}`,
  open_website: (a) => `Opened ${a.url}`,
  web_search: (a) => `Searched the web for “${a.query}”`,
  web_read: () => 'Read the page',
  files_search: (a) => `Searched your files for “${a.query}”`,
  images_generate: () => 'Made a picture',
  images_blur: () => 'Blurred private details',
  images_remove_background: () => 'Removed the background',
  images_upscale: () => 'Upscaled the picture 2×',
  mail_triage: () => 'Checked your inbox',
  memory_save: (a) => `Remembered: ${a.fact}`,
  memory_forget: () => 'Forgot that',
  screen_look: () => 'Looked at your screen',
  study_create: (a) => `Made ${a.kind === 'quiz' ? 'a quiz' : a.kind === 'flashcards' ? 'flashcards' : 'a summary'}${a.topic ? ` on ${a.topic}` : ''} (see Study)`,
};

const QUIET = /_(query|status|progress|list|files)$|^agent_/;

Object.assign(LABELS, {
  briefing_now: () => 'Prepared your briefing',
  pc_open_app: (a) => `Opened ${a.name}`,
  fs_write: (a) => `Wrote ${String(a.path || '').split(/[\\/]/).pop()}`,
  git_init: () => 'Started Git in the project',
  git_commit: (a) => `Committed: ${a.message}`,
  github_publish: (a) => `Published ${a.name} to GitHub`,
  run_command: (a) => `Ran ${a.command}`,
  timetable_add: (a) => `Added ${a.classes?.length || ''} classes to the timetable`,
  exams_add: (a) => `Added exam ${a.subject} on ${a.date}`,
  head_mouse: (a) => (a.on ? 'Turned on the head mouse' : 'Turned off the head mouse'),
  captions_toggle: (a) => (a.on ? `Showing live captions${a.translate ? ' in English' : ''}` : 'Hid live captions'),
  health_settings: () => 'Updated health breaks',
  screen_point: (a) => `Showed where “${a.target}” is`,
  write_here: () => 'Wrote it where your cursor is',
  teleprompter: (a) => (a.on === false ? 'Closed the teleprompter' : 'Started the teleprompter'),
  timer_set: (a) => `Timer: ${a.minutes >= 1 ? `${a.minutes} min` : `${Math.round(a.minutes * 60)} s`}${a.label ? ` · ${a.label}` : ''}`,
  timer_cancel: () => 'Cancelled the timer',
  list_add: (a) => `Added ${(a.items || []).join(', ')} to your ${a.list || 'shopping'} list`,
  list_remove: (a) => `Removed ${(a.items || []).join(', ') || 'everything'} from your ${a.list} list`,
  pc_dark_mode: (a) => (a.on ? 'Turned on dark mode' : 'Turned on light mode'),
  music_play: (a) => `Playing ${a.query}${a.app === 'spotify' ? ' on Spotify' : ''}`,
  camera_look: () => 'Looked through the camera',
  camera_read: () => 'Read the text through the camera',
  interpreter: (a) => (a.on ? 'Started interpreter mode' : 'Stopped interpreter mode'),
  contacts_add: (a) => `Saved contact ${a.name}`,
  contacts_delete: () => 'Deleted the contact',
  call_contact: (a) => `Calling ${a.who}`,
  whatsapp_message: (a) => `WhatsApp message to ${a.who} is ready to send`,
  diary_add: () => 'Saved in your diary',
  pc_media: (a) => `Media: ${String(a.action).replace(/_/g, ' ')}`,
  pc_volume: (a) => (a.level !== undefined ? `Volume set to ${a.level}` : 'Checked the volume'),
  pc_brightness: (a) => (a.level !== undefined ? `Brightness set to ${a.level}` : 'Checked the brightness'),
  pc_lock: () => 'Locked the computer',
  pc_settings_page: (a) => `Opened ${a.page} settings`,
  pc_power: (a) => (a.action === 'cancel' ? 'Cancelled the shutdown' : `${a.action}${a.minutes ? ` in ${a.minutes} min` : ''}`),
  pc_close_app: (a) => `Closed ${a.name}`,
  routines_save: (a) => `Saved routine “${a.name}”`,
  routines_run: (a) => `Ran routine “${a.name}”`,
  routines_delete: (a) => `Deleted routine “${a.name}”`,
  routines_history: () => "Checked workflow runs",
  routines_control: (a) => `${a.action[0].toUpperCase()}${a.action.slice(1)} workflow run ${a.run_id}`,
  routines_schedule: (a) => (a.time ? `Scheduled “${a.name}” daily at ${a.time}` : `Unscheduled “${a.name}”`),
  python_run: () => 'Ran Python code',
  files_make_presentation: (a) => `Made a PowerPoint: ${a.title}`,
  files_make_document: (a) => `Made a Word document: ${a.title}`,
  files_make_pdf: (a) => `Made a PDF: ${a.title}`,
});

const FileLinks = ({ paths }) => (
  <ul className="result-list">
    {paths.map((p) => (
      <li key={p}>
        <button className="link" onClick={() => window.ather.openPath(p)}>📄 {p.split(/[\\/]/).pop()}</button>{' '}
        <button className="link muted" onClick={() => window.ather.showInFolder(p)}>show in folder</button>
      </li>
    ))}
  </ul>
);

export default function ToolResult({ event }) {
  const { name, args, result } = event;
  if (result?.error) return <div className="chip chip-error">⚠ {result.error}</div>;
  if (result?.denied) return <div className="chip chip-error">✋ Cancelled: {name.replace(/_/g, ' ')}</div>;
  if (name === 'pc_open_app' && result?.not_installed) return <div className="chip">🔎 {result.tell_user}</div>;
  if (name === 'qa_check_site' && result) {
    return <div className={`chip ${result.ok ? '' : 'chip-error'}`}>{result.ok ? '✓ QA passed: no errors' : `⚠ QA found ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}`}</div>;
  }
  if (QUIET.test(name) && name !== 'files_search') return null;

  if (name === 'python_run') {
    return (
      <div className="tool-result">
        <div className={`chip ${result.exit_code ? 'chip-error' : ''}`}>{result.exit_code ? '⚠ Python finished with an error' : '✓ Ran Python code'}</div>
        {(result.stdout || result.stderr) && <pre className="py-out">{result.stdout}{result.stderr && <span className="bad">{result.stderr}</span>}</pre>}
        {result.images?.map((p) => <img key={p} className="result-image" src={fileUrl(p)} alt="Chart" onClick={() => window.ather.openPath(p)} />)}
        {result.files?.length > 0 && <FileLinks paths={result.files} />}
      </div>
    );
  }
  if (name.startsWith('files_make_') && result?.path) {
    return <div className="tool-result"><div className="chip">✓ {LABELS[name](args || {})}</div><FileLinks paths={[result.path]} /></div>;
  }

  const label = LABELS[name]?.(args || {}) || name.replace(/_/g, ' ');
  return (
    <div className="tool-result">
      <div className="chip">✓ {label}</div>
      {result?.paths?.length > 1 ? (
        <div className="result-grid">
          {result.paths.map((p) => <img key={p} className="result-image" src={fileUrl(p)} alt={args.prompt || 'Result'} onClick={() => window.ather.openPath(p)} title="Open picture" />)}
        </div>
      ) : result?.path && /\.(png|jpe?g|webp)$/i.test(result.path) && (
        <img className="result-image" src={fileUrl(result.path)} alt={args.prompt || 'Result'} onClick={() => window.ather.openPath(result.path)} title="Open picture" />
      )}
      {name === 'files_search' && Array.isArray(result) && (
        <ul className="result-list">
          {result.slice(0, 5).map((r, i) => (
            <li key={i}>
              {r.path
                ? <button className="link" onClick={() => window.ather.openPath(r.path)}>{r.kind === 'image' ? '🖼' : '📄'} {r.path.split(/[\\/]/).pop()}</button>
                : <span>📝 {r.preview}</span>}
            </li>
          ))}
        </ul>
      )}
      {name === 'web_search' && Array.isArray(result) && (
        <ul className="result-list">
          {result.slice(0, 3).map((r, i) => <li key={i}><button className="link" onClick={() => window.ather.openExternal(r.url)}>{r.title}</button></li>)}
        </ul>
      )}
      {name === 'mail_triage' && result?.mails && (
        <ul className="result-list">
          {result.mails.filter((m) => m.needs_you).slice(0, 5).map((m) => <li key={m.uid}><b>{m.from.split('<')[0]}</b> {m.subject} <em>{m.why}</em></li>)}
        </ul>
      )}
    </div>
  );
}
