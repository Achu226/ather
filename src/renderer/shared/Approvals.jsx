import { useEffect, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';

const TITLES = {
  python_run: 'Run this Python code on your computer?',
  pc_power: 'Change your computer\'s power state?',
  pc_close_app: 'Close this app?',
  computer_start: 'Let Maya use your mouse and keyboard for this?',
  run_command: 'Run this command on your computer?',
  github_publish: 'Publish this project on GitHub (public)?',
  work_timer_start: 'Start this work timer?',
  fs_edit: 'Change this file?',
  mail_reply: 'Send this reply?',
  mail_send: 'Send this email?',
  mail_archive: 'Move these emails out of your inbox?',
  mail_add_tasks: 'Add these to your tasks and calendar?',
  browser_click: 'Click this on the website?',
};

/** The question on the card (also spoken when the user answers by voice). */
export const approvalTitle = (r) => (r.name === 'mail_send' && r.args?.to ? `Send this email to ${r.args.to}?`
  : r.name === 'skills_learn' ? `I learned how to do this. Shall I remember it as the skill "${r.args?.name}"?`
  : TITLES[r.name] || `Allow ${r.name.replace(/_/g, ' ')}?`);

function details(name, args) {
  if (name === 'python_run') return `\`\`\`python\n${args.code}\n\`\`\``;
  if (name === 'pc_power') return `**${args.action}**${args.minutes ? ` in ${args.minutes} minute(s)` : ''}`;
  if (name === 'pc_close_app') return `**${args.name}** (unsaved work in it may be lost)`;
  if (name === 'computer_start') return `**${args.task}**\n\nPress Esc at any time to take control back.`;
  if (name === 'fs_edit') return `**${args.path}**\n\nReplace:\n\`\`\`\n${args.find}\n\`\`\`\nwith:\n\`\`\`\n${args.replace}\n\`\`\``;
  if (name === 'work_timer_start') {
    const end = new Date(Date.now() + args.minutes * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `**${args.task || 'Work'}** until **${end}**${args.shutdown === false ? '' : ', then the PC **shuts down** (you get a 1 minute warning and can say "wait")'}.`;
  }
  if (name === 'mail_send') return `**To:** ${args.to}\n**Subject:** ${args.subject}\n\n${args.text}`;
  if (name === 'mail_reply') return args.text;
  if (name === 'browser_click') return `**${args.label}**${args.site ? ` on ${args.site}` : ''}`;
  if (name === 'skills_learn') return `**When:** ${args.when}\n\n${args.steps}\n\nYou can switch it off or delete it on the Skills page.`;
  if (name === 'mail_archive') return `**${args.uids?.length || 0}** email(s). They stay in your archive; nothing is deleted.`;
  if (name === 'mail_add_tasks') return args.items?.map((i) => `- ${i.kind}: **${i.title}**${i.when ? ` (${i.when.replace('T', ' ')})` : ''}`).join('\n');
  return `\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``;
}

/** Cards asking the user to allow risky actions; nothing runs until they click Allow. */
export default function Approvals({ onPending = () => {} }) {
  const [requests, setRequests] = useState([]);
  useEffect(() => window.ather.onApprovalRequest((r) => setRequests((list) => [...list, r])), []);
  // Answered elsewhere, timed out, or its request ended: the card goes away.
  useEffect(() => window.ather.onApprovalClosed((id) => setRequests((list) => list.filter((r) => r.id !== id))), []);
  // Nod = Allow, shake = Cancel (head mouse users who cannot speak or click): the oldest card here.
  const latest = useRef([]);
  latest.current = requests;
  useEffect(() => window.ather.onApprovalGesture((yes) => {
    const first = latest.current[0];
    if (!first) return;
    window.ather.answerApproval(first.id, yes);
    setRequests((list) => list.filter((r) => r.id !== first.id));
  }), []);
  useEffect(() => onPending(requests.length > 0), [requests.length]);

  const answer = (id, ok) => {
    window.ather.answerApproval(id, ok);
    setRequests((list) => list.filter((r) => r.id !== id));
  };

  return requests.map((r) => (
    <div key={r.id} className="approval" role="alertdialog" aria-label={approvalTitle(r)}>
      <b>{r.name === 'skills_learn' ? '💡' : '⚠'} {approvalTitle(r)}</b>
      <div className="approval-body"><Markdown text={details(r.name, r.args || {})} /></div>
      <div className="row">
        <button className="btn small primary" onClick={() => answer(r.id, true)}>{r.name === 'python_run' ? '▶ Run' : r.name === 'skills_learn' ? 'Keep it' : 'Allow'}</button>
        <button className="btn small" onClick={() => answer(r.id, false)}>Cancel</button>
      </div>
    </div>
  ));
}

/** Live checklist for agent mode, built from agent_plan / agent_step tool events. */
export function AgentChecklist({ tools }) {
  const plan = [...tools].reverse().find((t) => t.name === 'agent_plan');
  if (!plan) return null;
  const status = {};
  for (const t of tools) if (t.name === 'agent_step') status[t.args.index] = t.args;
  return (
    <div className="agent-plan">
      <b>🤖 Plan</b>
      <ol>
        {(plan.args.steps || []).map((s, i) => (
          <li key={i} className={status[i]?.status || 'todo'}>
            {status[i]?.status === 'done' ? '✅' : status[i]?.status === 'failed' ? '❌' : '⬜'} {s}
            {status[i]?.note && <small className="muted"> — {status[i].note}</small>}
          </li>
        ))}
      </ol>
    </div>
  );
}
