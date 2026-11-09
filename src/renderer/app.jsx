import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import Face from './shared/Face.jsx';
import Setup from './app/Setup.jsx';
import Home from './app/Home.jsx';
import Chat from './app/Chat.jsx';
import Tasks from './app/Tasks.jsx';
import Notes from './app/Notes.jsx';
import Habits from './app/Habits.jsx';
import Focus from './app/Focus.jsx';
import Calendar from './app/Calendar.jsx';
import Inbox from './app/Inbox.jsx';
import Search from './app/Search.jsx';
import Images from './app/Images.jsx';
import Settings from './app/Settings.jsx';
import Study from './app/Study.jsx';
import Activity from './app/Activity.jsx';
import Models from './app/Models.jsx';
import Mcp from './app/Mcp.jsx';
import Workflows from './app/Workflows.jsx';
import Accessibility from './app/Accessibility.jsx';
import Skills from './app/Skills.jsx';
import Monitor from './app/Monitor.jsx';
import Agent from './app/Agent.jsx';
import Connections from './app/Connections.jsx';
import Brain from './app/Brain.jsx';
import Approvals from './shared/Approvals.jsx';
import LockScreen, { useLocked } from './shared/LockScreen.jsx';
import './shared/base.css';
import './app.css';

const SECTIONS = [
  ['home', 'Home', '🏠', Home],
  ['chat', 'Chat', '💬', Chat],
  ['accessibility', 'Accessibility', '♿', Accessibility],
  ['brain', 'Brain', '🧠', Brain],
  ['agent', 'My Maya', '🤖', Agent],
  ['connections', 'Connections', '🔗', Connections],
  ['skills', 'Skills', '✨', Skills],
  ['monitor', 'Work monitor', '🛠', Monitor],
  ['tasks', 'Tasks', '✅', Tasks],
  ['notes', 'Notes', '📝', Notes],
  ['habits', 'Habits', '🔁', Habits],
  ['focus', 'Focus', '⏱', Focus],
  ['study', 'Study', '🎓', Study],
  ['workflows', 'Workflows', '🔀', Workflows],
  ['activity', 'Activity', '📊', Activity],
  ['calendar', 'Calendar', '📅', Calendar],
  ['inbox', 'Inbox', '✉️', Inbox],
  ['search', 'Smart search', '🔎', Search],
  ['images', 'Image tools', '🖼', Images],
  ['models', 'AI models', '🧠', Models],
  ['mcp', 'Connected tools', '🔌', Mcp],
  ['settings', 'Settings', '⚙️', Settings],
];

function App() {
  const [section, setSection] = useState(location.hash.slice(1) || 'home');
  const [version, setVersion] = useState(0); // bumps when data changes so screens reload

  useEffect(() => {
    const offs = [
      window.ather.onSection(setSection),
      window.ather.onDataChanged(() => setVersion((v) => v + 1)),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  // Hidden pages and Maya's own name (My Maya).
  const [hidden, setHidden] = useState([]);
  const [myName, setMyName] = useState('Maya');
  useEffect(() => {
    window.ather.getSetting('ui', {}).then((ui) => setHidden(ui?.hidePages || []));
    window.ather.getSetting('agent', {}).then((a) => setMyName(a?.name || 'Maya'));
    return window.ather.onSettingsChanged((key, value) => {
      if (key === 'ui') setHidden(value?.hidePages || []);
      if (key === 'agent') setMyName(value?.name || 'Maya');
    });
  }, []);

  const locked = useLocked();
  if (locked) return <LockScreen />;

  // "chat:12" opens section chat with argument 12 (a conversation id).
  const [name, arg] = section.split(':');
  if (name === 'setup') return <Setup onDone={() => setSection('home')} />;
  const Current = SECTIONS.find(([id]) => id === name)?.[3] || Home;

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Sections">
        <div className="brand"><Face size={40} mood="happy" /><span>{myName}</span></div>
        {SECTIONS.filter(([id]) => !hidden.includes(id) || name === id).map(([id, label, icon]) => (
          <button key={id} className={`nav ${name === id ? 'active' : ''}`} onClick={() => setSection(id)} aria-current={name === id ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden>{icon}</span>{label}
          </button>
        ))}
        <div className="sidebar-foot">Hover the top of your screen or press <kbd>Ctrl</kbd>+<kbd>Space</kbd></div>
      </nav>
      <main className="content">
        <Current version={version} go={setSection} arg={arg} />
      </main>
      <div className="approvals-dock"><Approvals /></div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
