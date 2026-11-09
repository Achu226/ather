import { OLLAMA } from './ollama.js';
import { systemPrompt, calendarWeek } from './personality.js';
import { pickModel, liteSwap } from './models.js';
import { selectTools } from './tools/select.js';
import { now } from './store.js';
import { approvedFolders } from './services/mcp-presets.js';
import { matchSkill } from './services/skills.js';
import { logWork } from './services/worklog.js';
import { scriptLanguage } from './services/sapi.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_MODEL = 'qwen3.5:4b';
export const BRAIN_MODEL = 'ather-brain'; // BASE_MODEL with a bigger context, see ensureBrainModel
const MAX_TOOL_ROUNDS = 6;
// Tools that read the user's screen, files or mail are not offered to cloud models without permission.
export const CLOUD_PRIVATE = /^(screen_look|files_|open_file|python_|images_(blur|remove|upscale)|mail_|fs_|computer_|clipboard_|camera_|contacts_|call_contact|whatsapp_|diary_|medical_)/;
const AGENT_ROUNDS = 25;
const BUILDER_ROUNDS = 40;
const COMPUTER_ROUNDS = 30;
// The builder's roles only need file, command, git, QA and web tools: a short list keeps the model on task.
// Actions that end or remove something, and the words that ask for them.
const DRASTIC = /^(pc_close_app|pc_power|work_timer_start|mail_archive|fs_trash)$/;
const DRASTIC_WORDS = /\b(close|quit|exit|kill|end|stop|shut|turn off|switch off|power|restart|reboot|sleep|hibernate|archive|delete|trash|remove|clean|tidy|free up|timer)\b/i;
const BUILDER_TOOLS =/^(fs_|run_command$|git_|github_publish$|qa_check_site$|agent_step$|web_search$|web_read|time_now$|open_file$|open_website$)/;
const HISTORY = 20;
// Actions that only make sense once per request, however the model rewords them.
const ONCE = /^(diary_add|whatsapp_message|call_contact|music_play|teleprompter|interpreter|pc_dark_mode|write_here)$/;
// Tools that may rightly run again with the same arguments (looking again after an action, reading data).
const REPEATABLE = /^(computer_(look|click|type|keys|scroll)|screen_look|camera_)|_(query|status|list|history|progress)$/;

/**
 * Ask the brain one question in a conversation. Streams events through onEvent:
 *   { type: 'model', key, label } | { type: 'reasoning', text } | { type: 'token', text }
 *   | { type: 'tool', name, args, result } | { type: 'done', text }
 * style: 'short' (notch, spoken) or 'chat' (ChatGPT-style window). mode: auto | fast | think | smart | coder.
 */
export async function ask({ text, images = [], store, tools, services, onEvent = () => {}, signal, conversationId = null, style = 'short', mode = 'auto' }) {
  const hybrid = store.getSetting('hybrid', false) ? store.getSetting('hybridModel', null) : null;
  let choice = await pickModel(mode, text, { images: images.length, style, hybrid });
  // A multi-step job a skill already knows ("save a WhatsApp video") follows the skill's proven steps, not a fresh plan.
  if (mode === 'auto' && choice.key === 'agent' && matchSkill(store, text)) choice = await pickModel('smart', text);
  const provider = choice.provider ? services?.providers?.get(choice.provider) : null;
  if (choice.provider && !provider) throw new Error(`The model provider "${choice.provider}" is not set up. Add it in Models.`);
  // Privacy: cloud models never get files, screenshots, documents or pictures unless the user allowed it.
  const cloudLimited = provider && !provider.local && !store.getSetting('cloudShareFiles', false);
  if (cloudLimited) images = [];
  onEvent({ type: 'model', key: choice.key, label: choice.label });

  // Agent mode: write the plan up front (structured output is reliable; asking the model to call agent_plan is not).
  let plan = null, projectDir = null;
  if (choice.builder) {
    const raw = await complete(`You are the Supervisor of a software team (Engineer, QA, DevOps). Break this request into 4 to 10 concrete steps. Start every step with its role in brackets: [Engineer] writes or fixes files, [QA] tests (open the site and check for errors, or run tests), [DevOps] Git commit, and publishing only if the user asked. Request: "${text}". Also give a short kebab-case project folder name. Reply as JSON.`,
      { model: choice.model, signal, format: { type: 'object', required: ['project', 'steps'], properties: { project: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } } } });
    const parsed = JSON.parse(raw);
    plan = parsed.steps.slice(0, 10);
    const base = approvedFolders(store).find((f) => /documents$/i.test(f)) || approvedFolders(store)[0];
    const slug = (parsed.project || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
    projectDir = join(base, 'Maya Projects', slug);
    mkdirSync(projectDir, { recursive: true });
    onEvent({ type: 'tool', name: 'agent_plan', args: { steps: plan }, result: { planned: plan.length, folder: projectDir } });
  } else if (choice.agent) {
    // The dates are given, so the plan never wastes a step (or Python) working out what day it is.
    const raw = await complete(`Dates (already known, never a step): ${calendarWeek()}. Break this goal into 2 to 8 short, concrete steps an assistant with tools (tasks, notes, reminders, calendar, web search, files, Python, study sets) can do; each step does something. Goal: "${text}". Reply as JSON.`,
      { model: choice.model, signal, format: { type: 'object', required: ['steps'], properties: { steps: { type: 'array', items: { type: 'string' } } } } });
    plan = JSON.parse(raw).steps.slice(0, 8);
    onEvent({ type: 'tool', name: 'agent_plan', args: { steps: plan }, result: { planned: plan.length } });
  }
  const history = store.all('SELECT role, content FROM messages WHERE conversation_id IS ? ORDER BY id DESC LIMIT ?', conversationId, HISTORY).reverse();
  const previous = [...history].reverse().find((m) => m.role === 'user')?.content || '';
  const everyTool = tools;
  // Agent mode picks tools from the goal and its own plan, like chat does: all ~150 at once confuse the small model.
  // The Builder still gets everything, narrowed below to its team's tools.
  const picked = selectTools(tools, text, { agent: choice.builder, previous: [previous, ...(plan || [])].join('\n'), images: images.length });
  const screenAsked = selectTools(tools, `${text}\n${previous}`).some((t) => t.name === 'computer_start');
  tools = (choice.agent && !choice.builder ? [...picked.filter((t) => screenAsked || !t.name.startsWith('computer_')), ...tools.filter((t) => t.name === 'agent_step')] : picked)
    .filter((t) => (choice.agent ? t.name !== 'agent_plan' : !t.name.startsWith('agent_')))
    .filter((t) => !choice.builder || BUILDER_TOOLS.test(t.name))
    .filter((t) => !cloudLimited || !CLOUD_PRIVATE.test(t.name));
  // A skill that fits ("research report", or one the user taught) brings its tools and its steps.
  // Closing apps, shutting down, deleting or archiving only when *this* sentence asks for it: an earlier "open
  // WhatsApp" must not let "how much RAM am I using?" end with Maya closing Chrome to free memory.
  const askedDrastic = DRASTIC_WORDS.test(text);
  const drastic = (t) => !askedDrastic && DRASTIC.test(t.name);
  tools = tools.filter((t) => !drastic(t));
  // An everyday goal in Agent mode gets no coding tools: small models reach for Python to count days.
  if (choice.agent && !choice.builder && !/\b(code|coding|project|files?|folders?|script|python|git|program|bug|tests?|build|repo)\b/i.test(text)) tools = tools.filter((t) => !/^(run_command|fs_|git_|github_|python_)/.test(t.name));
  // Agent and Builder make their own plan; a skill's steps would fight it.
  let skill = choice.agent ? null : matchSkill(store, text);
  // A cloud model never gets the private tools (screen, files, mail), so a skill made only of them is skipped.
  if (skill?.tools && cloudLimited && everyTool.filter((t) => new RegExp(skill.tools).test(t.name)).every((t) => CLOUD_PRIVATE.test(t.name))) skill = null;
  if (skill) {
    const extra = skill.tools ? everyTool.filter((t) => new RegExp(skill.tools).test(t.name) && !tools.includes(t) && (!cloudLimited || !CLOUD_PRIVATE.test(t.name))) : [];
    tools = [...tools, ...extra];
    store.run('UPDATE skills SET uses = uses + 1 WHERE id = ?', skill.id);
    onEvent({ type: 'skill', name: skill.name });
  }
  // Controlling the PC needs the stronger model: the small one mixes up controls and grid cells.
  const onScreen = tools.some((t) => t.name === 'computer_start');
  if (mode === 'auto' && choice.key === 'fast' && onScreen) {
    choice = await pickModel('smart');
    onEvent({ type: 'model', key: choice.key, label: choice.label });
  }
  // "Make me a study plan": write it out. Models tend to add tasks unasked (so they get no task tools unless the user asks)
  // or to ask questions first (so they are told plainly to write it now).
  const planRequest = !choice.agent && /\bplan\b/i.test(text) && !/\b(add|tasks?|remind|reminders?|calendar)\b/i.test(text);
  if (planRequest) tools = tools.filter((t) => !/^(tasks_create|reminders_create|calendar_create|habits_create)$/.test(t.name));
  // "Work 2 hours, then shut down": the work timer says goodbye and lets them say "wait"; a bare shutdown would not.
  if (/\b(after|then|later)\b.*\bshut ?down\b|\bshut ?down\b.*\b(after|in)\b/i.test(text) && tools.some((t) => t.name === 'work_timer_start')) tools = tools.filter((t) => t.name !== 'pc_power');
  // "Change your name to Priya", "talk slower": a real setting, not a note about one (small models pick memory_save).
  if (tools.some((t) => t.name === 'persona_set') && /\b(your name|call yourself|rename you|talk|speak|voice)\b.{0,30}\b(to|slower|faster|slowly|quickly|louder)\b|\b(slow(er)? down|speed up)\b/i.test(text)) tools = tools.filter((t) => t.name !== 'memory_save');
  // "Remind me if Rahul doesn't reply": a timed reminder would fire even after he replied; only mail_follow_up checks.
  if (/\b(doesn'?t|does not|don'?t|hasn'?t|has not|no) (reply|respond|answer|get back)/i.test(text) && tools.some((t) => t.name === 'mail_follow_up')) tools = tools.filter((t) => t.name !== 'reminders_create');
  // "Search X in Chrome", "message Rahul on WhatsApp": the user wants it done on the screen, not answered from the web.
  if (onScreen && !choice.agent) tools = tools.filter((t) => !/^web_/.test(t.name));
  const noTools = store.getSetting('noToolModels', []).includes(choice.model);
  let toolSpecs = noTools ? [] : tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const summary = conversationId ? store.get('SELECT summary FROM conversations WHERE id = ?', conversationId)?.summary : null;
  const memories = store.all("SELECT fact, category FROM memories WHERE deleted = 0 ORDER BY category, id").map((m) => `(${m.category || 'fact'}) ${m.fact}`);
  const documents = conversationId && services?.docs && !cloudLimited ? await services.docs.context(conversationId, text) : '';
  // Small models follow the newest message best: the user's own answer rules ride along with each question.
  const rules = memories.filter((m) => m.startsWith('(preference)')).map((m) => m.replace(/^\(preference\)\s*(How the user wants answers:\s*)?/, '').replace(/\s*\(said after.*\)$/, ''));
  const asked = rules.length ? `${text}\n\n(My standing wishes for your answers: ${rules.join('; ')})` : text;
  const userContent = images.length
    ? [{ type: 'text', text: asked }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : asked;
  const messages = [
    { role: 'system', content: systemPrompt(store.getSetting('personality', 'normal'), { style, memories, documents, summary, agent: !!choice.agent, builder: !!choice.builder, custom: store.getSetting('customPersonalities', []), me: { ...store.getSetting('agent', {}), callMe: store.getSetting('userTitle', '') } }) },
    ...history,
    { role: 'user', content: userContent },
  ];

  // Asked in Tamil (or another script): small models drift back to English, so say it plainly.
  const script = { ta: 'Tamil (தமிழ்)', hi: 'Hindi', te: 'Telugu', bn: 'Bengali', ar: 'Arabic', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' }[scriptLanguage(text)];
  if (script) messages[0].content += `\nThe user wrote in ${script}. Answer in ${script}, in its own script.`;
  if (skill) messages[0].content += `\nUse your skill "${skill.name}" for this request. Its steps:\n${skill.steps}`;
  if (plan) messages[0].content += `\nYour plan (already shown to the user):\n${plan.map((s, i) => `${i}. ${s}`).join('\n')}`;
  if (planRequest) messages[0].content += '\nThe user wants the plan itself in this answer: write the complete day-by-day plan now, with sensible assumptions stated in one line. Do not ask questions before it; you may offer to adjust after it.';
  if (onScreen) messages[0].content += '\nThe user wants this done ON THE SCREEN, the way a person uses the PC: computer_open the app, computer_start, computer_look, then click and type. After every step check what the window shows now; if it did not work, try another way. Do not stop until it is done or truly blocked.';
  if (projectDir) messages[0].content += `\nProject folder (use this exact path for every file, QA and Git call): ${projectDir}`;
  if (cloudLimited) messages[0].content += '\nYou are a cloud model: the user\'s files, screen and documents are not shared with you. If they are needed, say the user can switch to a local model or allow sharing in Models.';

  let answer = '';
  const toolLog = plan ? [{ name: 'agent_plan', args: { steps: plan }, result: { planned: plan.length } }] : [];
  const ctx = { store, services, conversationId };
  let checkedClaims = false, checkedRefusal = false, nudges = 0;
  const doneCalls = new Set(); // "tool args" already run in this answer
  let maxRounds = choice.builder ? BUILDER_ROUNDS : choice.agent ? AGENT_ROUNDS : MAX_TOOL_ROUNDS;
  const toolPictures = new Set(); // screenshot messages; only the newest is kept so long PC tasks fit in context
  for (let round = 0; round <= maxRounds; round++) {
    const turn = () => streamChat({
      model: choice.model, think: !!choice.think, messages, tools: toolSpecs, signal, provider, providers: services?.providers, store,
      onToken: (t) => onEvent({ type: 'token', text: t }), onReasoning: (t) => onEvent({ type: 'reasoning', text: t }),
    });
    // Ollama sometimes cannot parse a tool call the model wrote ("XML syntax error"): the same step again usually works.
    let reply;
    for (let attempt = 0; ; attempt++) {
      try { reply = await turn(); break; } catch (e) {
        if (attempt >= 2 || signal?.aborted || !/syntax error|unexpected end|failed to parse/i.test(e.message)) throw e;
        onEvent({ type: 'retry', reason: 'the model wrote a broken tool call' });
      }
    }
    let { content, toolCalls, usage } = reply;
    // Some models write the tool call as text ({"name": "fs_write", "arguments": …}) instead of making it: do it anyway.
    if (!toolCalls.length && toolSpecs.length) {
      const written = toolCallsInText(content, tools);
      if (written.length) { toolCalls = written; content = ''; onEvent({ type: 'retry', reason: 'tool written as text' }); }
    }
    services?.providers?.recordUsage(provider?.id || 'ollama', choice.model, usage);
    answer = dropRepeats(content);
    if (!toolCalls.length) {
      // "I can't control your PC": the words just missed the keywords that offer the tools. Once, with every tool.
      // Never after the user said no to an action: then "I can't" is the honest answer.
      if (!checkedRefusal && !noTools && !choice.agent && wrongRefusal(content) && tools.length < everyTool.length && !toolLog.some((t) => t.result?.denied)) {
        checkedRefusal = true;
        tools = everyTool.filter((t) => !t.name.startsWith('agent_') && !drastic(t) && (!cloudLimited || !CLOUD_PRIVATE.test(t.name)));
        toolSpecs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
        messages.push({ role: 'assistant', content }, { role: 'user', content: '(Check before answering: you DO control this PC, the user\'s email and yourself through your tools (pc_power, pc_open_app, computer_start, mail_send, mail_reply, persona_set for your own name, voice and speed, ui_set for the screens…), now all available. Do what the user asked with them; risky actions ask the user to allow first. Do not mention this check.)' });
        onEvent({ type: 'retry', reason: 'used the tools instead of refusing' });
        continue;
      }
      // Agent mode stopped with steps of its plan still open ("I'll create the sessions…" and nothing): carry on, up to 3 times.
      const stepsDone = toolLog.filter((t) => t.name === 'agent_step').length;
      const changes = toolLog.filter((t) => !/^(agent_|time_|web_)|_(query|status|progress|list|search|read)$/.test(t.name)).length;
      if (choice.agent && plan && nudges < 3 && stepsDone < plan.length && changes < plan.length && round < maxRounds - 1) {
        nudges++;
        messages.push({ role: 'assistant', content }, { role: 'user', content: `(Not finished: ${stepsDone} of ${plan.length} plan steps are marked done. Do the next step of your plan now with tools, then call agent_step. Do not mention this note.)` });
        onEvent({ type: 'retry', reason: 'plan not finished' });
        continue;
      }
      // Honesty check: "I typed / clicked / sent…" must be backed by a tool that really did it. Once per question,
      // Maya goes back to either do it now (with the PC-control tools) or say plainly what it did not do.
      // "…Let me try again:" and then nothing: give it the round it just promised itself.
      if (!checkedClaims && !noTools && (promisedRetry(content) || (!toolLog.length && promisedAction(content)))) {
        checkedClaims = true;
        messages.push({ role: 'assistant', content }, { role: 'user', content: '(Go ahead now: call the tool again with corrected arguments. Do not mention this note.)' });
        onEvent({ type: 'retry', reason: 'promised to try again' });
        continue;
      }
      const claim = !checkedClaims && unbackedClaim(content, toolLog);
      if (!claim) break;
      checkedClaims = true;
      // PC control is offered only for typing/clicking claims (a small model given it for anything else loops on it).
      if (/typed|clicked/.test(claim) && !cloudLimited && !noTools && !tools.some((t) => t.name === 'computer_start')) {
        tools = [...tools, ...everyTool.filter((t) => t.name.startsWith('computer_'))];
        toolSpecs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
      }
      const how = claim === 'called them' ? 'call_contact' : 'computer_start, then act, then look to confirm it worked';
      messages.push({ role: 'assistant', content }, { role: 'user', content: `(Check before answering: you said you ${claim}, but no tool did that. If it is still needed, do it now: ${how}. Otherwise tell the user honestly what you did and did not do. Do not mention this check.)` });
      onEvent({ type: 'retry', reason: claim });
      continue;
    }

    messages.push({ role: 'assistant', content, tool_calls: toolCalls });
    // Controlling the PC takes many small steps (look, click, type, check): give it room.
    if (toolCalls.some((c) => c.function.name.startsWith('computer_'))) maxRounds = Math.max(maxRounds, COMPUTER_ROUNDS);
    const pictures = [];
    let repeated = 0;
    for (const call of toolCalls) {
      const tool = tools.find((t) => t.name === call.function.name);
      let args = {};
      let result, started = Date.now();
      try {
        args = JSON.parse(call.function.arguments || '{}');
        if (!tool) throw new Error(`Unknown tool ${call.function.name}`);
        args = unpackArgs(args, tool.parameters);
        // Small models sometimes repeat the same action in a loop (7 diary entries for one sentence): do it once.
        const key = callKey(tool.name, args);
        if (!REPEATABLE.test(tool.name) && (doneCalls.has(key) || (ONCE.test(tool.name) && doneCalls.has(tool.name)))) {
          result = { already_done: true, note: 'You already did exactly this in this answer. Do not repeat it; answer the user now.' };
          repeated++;
        } else {
          doneCalls.add(key).add(tool.name);
          // Risky tools (running code, shutting down, closing apps) wait for the user's OK.
          const allowed = !tool.confirm || (await services?.confirm?.({ name: tool.name, args }));
          started = Date.now();
          result = allowed ? await tool.run(args, ctx) : { denied: true, message: 'The user did not allow this action. Do not retry it; ask what they want instead.' };
        }
      } catch (err) {
        result = { error: err.message };
      }
      if (!result?.already_done) {
        try { logWork(store, { source: choice.builder ? 'builder' : choice.agent ? 'agent' : 'chat', name: call.function.name, args, result, ms: Date.now() - started }); } catch { /* the monitor never breaks a task */ }
      }
      // A tool can hand the model a picture to look at (e.g. a screenshot).
      if (result?.attachImage) { pictures.push(result.attachImage); result = { ...result, attachImage: undefined, note: 'The image is attached in the next message.' }; }
      onEvent({ type: 'tool', name: call.function.name, args, result });
      toolLog.push(keepForHistory(call.function.name, args, result));
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
    }
    // Only repeats this round: take the tools away so the next round is the answer, not another loop.
    if (repeated && repeated === toolCalls.length) toolSpecs = [];
    if (pictures.length) {
      for (const m of toolPictures) m.content = 'An older image from a tool was here (removed; the newest one is below).';
      const msg = { role: 'user', content: [{ type: 'text', text: 'Here is the image from the tool.' }, ...pictures.map((url) => ({ type: 'image_url', image_url: { url } }))] };
      toolPictures.add(msg);
      messages.push(msg);
    }
  }
  // Control is for one request: give the mouse, keyboard and the Esc key back even if the model forgot computer_done.
  if (services?.computer?.active) { services.computer.stop('finished'); services.onComputerStop?.(); }

  // Rounds ran out while the model was still calling tools: one last round without tools, so the user never gets silence.
  if (!answer.trim() && toolLog.length) {
    messages.push({ role: 'user', content: '(Now answer the user in one or two sentences: what you did, using the tool results above. Do not mention this note.)' });
    const last = await streamChat({ model: choice.model, messages, tools: [], signal, provider, providers: services?.providers, store, onToken: (t) => onEvent({ type: 'token', text: t }) });
    answer = last.content.trim() || 'Done.';
  }

  const stamp = now();
  store.run('INSERT INTO messages (role, content, created_at, conversation_id) VALUES (?,?,?,?)', 'user', text, stamp, conversationId);
  store.run('INSERT INTO messages (role, content, created_at, conversation_id, model, tools) VALUES (?,?,?,?,?,?)',
    'assistant', answer, now(), conversationId, choice.key, toolLog.length ? JSON.stringify(toolLog) : null);
  if (conversationId) store.run('UPDATE conversations SET updated_at = ? WHERE id = ?', now(), conversationId);
  onEvent({ type: 'done', text: answer });
  return answer;
}

// Past-tense actions an answer may claim (said in the first person), and the tools that really do them.
const I_DID = (verbs) => new RegExp(`\\bI(?:'ve| have)?\\b[^.!?\\n]{0,80}\\b(${verbs})\\b`, 'i');
const CLAIMS = [
  [I_DID('typed|entered|wrote|filled'), 'typed it', /^computer_type$/],
  // computer_type can press Enter itself (enter: true), so it backs "pressed" too.
  [I_DID('clicked|pressed|tapped'), 'clicked or pressed it', /^computer_(click|keys|type)$/],
  [I_DID('sent'), 'sent it', /^(computer_|mail_send|mail_reply)/],
  // "I'm calling Amma now" / "initiating the call" must be backed by a real call.
  [I_DID('called|calling|initiating|initiated|placed|placing|connecting|dialed|dialled|dialing|dialling|ringing'), 'called them', /^call_contact$/],
];
/** The answer ends by promising to do or retry something now ("Let me try again:"). Exported for tests. */
/** "Sure, I'll open WhatsApp with…" as the whole answer, with nothing done: a promise to act now. Exported for tests. */
export const promisedAction = (answer) => /^\s*((sure|okay|ok|alright|of course)[,!.]?\s*)?(i'?ll|i will|let me|i'?m going to)\s+(open|send|call|message|save|add|set|play|start|write|make|create|turn|remind|put)\b/i.test(answer || '');

/** Same action, written slightly differently ("safely" / "safely."): name + the main text, letters and digits only. Exported for tests. */
export function callKey(name, args) {
  const text = Object.values(args || {}).filter((v) => typeof v === 'string').sort((a, b) => b.length - a.length)[0] || JSON.stringify(args || {});
  return `${name} ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 60)}`;
}

export const promisedRetry = (answer) => /\b(let me|i'?ll|i will)\s+(try|do|retry|fix|redo|run|make)\b[^.!?\n]{0,60}(again|now|that|it)?\s*[:.!…]*\s*$/i.test((answer || '').trim());

/** What the answer says it did on the PC that no successful tool call did, or null. Exported for tests. */
/** Small models sometimes loop and repeat whole paragraphs; keep the first copy of each (exported for tests). */
/** Tool calls a model wrote as JSON text instead of calling, for tools it was offered (exported for tests). */
export function toolCallsInText(content, tools) {
  const names = new Set(tools.map((t) => t.name));
  const calls = [];
  // Each balanced {...} block that parses as { name, arguments } for a known tool.
  for (let i = String(content).indexOf('{'); i >= 0 && calls.length < 5; i = content.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = i; j < content.length; j++) {
      const c = content[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) { end = j; break; }
    }
    if (end < 0) break;
    try {
      const raw = content.slice(i, end + 1);
      // Windows paths are often written with single backslashes ("C:\Users"): not valid JSON, so double them.
      const o = (() => { try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); } })();
      const args = o.arguments ?? o.parameters;
      if (names.has(o.name) && args && typeof args === 'object') {
        calls.push({ id: `text_${calls.length}`, type: 'function', function: { name: o.name, arguments: JSON.stringify(args) } });
        i = end;
      }
    } catch { /* not a tool call */ }
  }
  return calls;
}

export function dropRepeats(text) {
  const seen = new Set();
  return text.split(/\n{2,}/).filter((p) => {
    const key = p.trim().replace(/\s+/g, ' ');
    if (key.length < 40) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join('\n\n');
}

/**
 * "I can't turn off your computer / I don't have access to your PC": Maya can, the tool was just not offered
 * for these words. Exported for tests.
 */
export const wrongRefusal = (answer) => /\b(I )?(can(no|')t|cannot|am not able to|am unable to|don'?t have (the )?(access|ability|permission)|do not have (the )?(access|ability|permission))\b[^.]{0,80}\b(computer|pc|laptop|system|hardware|operating system|screen|apps?|email|mail|inbox|send|turn off|shut ?down|restart|control|open|click|type|name|settings?|voice|speed|myself)/i.test(answer || '');

export function unbackedClaim(answer, toolLog) {
  const ok = toolLog.filter((t) => !t.result?.error && !t.result?.denied).map((t) => t.name);
  for (const [said, what, tool] of CLAIMS) if (said.test(answer || '') && !ok.some((n) => tool.test(n))) return what;
  return null;
}

/**
 * Small models sometimes send a list or object as JSON text ("slides": "[{…}]"). Unpack those when the tool
 * expects an array/object and the text really is one; everything else is left as it came. Exported for tests.
 */
export function unpackArgs(args, schema) {
  const props = schema?.properties || {};
  const out = { ...args };
  for (const [key, value] of Object.entries(args || {})) {
    const want = props[key]?.type;
    if (typeof value !== 'string' || (want !== 'array' && want !== 'object')) continue;
    try {
      const parsed = JSON.parse(value);
      if (want === 'array' ? Array.isArray(parsed) : parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out[key] = parsed;
    } catch { /* not JSON: the tool reports the problem itself */ }
  }
  return out;
}

/** The part of a tool call worth showing again in chat history (files, charts, short output), not bulky data. */
export function keepForHistory(name, args, result) {
  const keep = {};
  if (Array.isArray(result)) keep.list = result.slice(0, 5);
  else if (result && typeof result === 'object') {
    for (const k of ['path', 'paths', 'images', 'files', 'exit_code', 'error', 'denied', 'prompt', 'title', 'blurred', 'model']) if (result[k] !== undefined) keep[k] = result[k];
    for (const k of ['stdout', 'stderr']) if (result[k]) keep[k] = String(result[k]).slice(0, 2000);
    if (result.mails) keep.mails = result.mails.filter((m) => m.needs_you).slice(0, 5);
  }
  const shortArgs = Object.fromEntries(Object.entries(args || {}).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 3000) : v]));
  return { name, args: shortArgs, result: keep.list ?? keep };
}

/** Long chats: summarise everything older than the recent window so the model keeps the thread. */
export async function updateSummary(store, conversationId) {
  const all = store.all('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id', conversationId);
  if (all.length <= HISTORY) return null;
  const older = all.slice(0, -HISTORY).map((m) => `${m.role === 'user' ? 'User' : 'Maya'}: ${m.content.slice(0, 800)}`).join('\n');
  const summary = await complete(`Summarise this earlier part of a conversation in at most 150 words. Keep names, facts, decisions and open questions.\n\n${older.slice(-12000)}`);
  store.run('UPDATE conversations SET summary = ? WHERE id = ?', summary.trim(), conversationId);
  return summary;
}

/** Three short questions the user might ask next (shown as chips under a chat answer). */
export async function followUps(question, answer) {
  const raw = await complete(
    `A user asked: "${question.slice(0, 500)}"\nThe assistant answered: "${answer.slice(0, 1500)}"\nSuggest 3 short follow-up messages the USER might send next (max 8 words each, in the user's language). Reply as JSON.`,
    { format: { type: 'object', required: ['followups'], properties: { followups: { type: 'array', items: { type: 'string' } } } } });
  return JSON.parse(raw).followups.slice(0, 3);
}

/** A clear message when Ollama cannot answer; "model not found" means that brain is not downloaded yet. Exported for tests. */
export function modelError(status, text = '', model = '') {
  if (status === 404 && /not found/i.test(text)) return new Error(`My AI brain${model ? ` (${model})` : ''} is not downloaded yet. Open Settings → AI models and press Download, or run start.bat again.`);
  return new Error(`The AI model did not answer (${status}): ${text.slice(0, 300)}`);
}

/** One-shot completion without tools or history (titles, quizzes, triage). */
/** One-shot answer; images are base64 strings (no data: prefix) for vision questions. */
export async function complete(prompt, { model = BRAIN_MODEL, format, signal, images } = {}) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST', signal,
    body: JSON.stringify({ model: liteSwap(model), stream: false, think: false, format, options: { temperature: 0.3 }, messages: [{ role: 'user', content: prompt, images }] }),
  });
  if (!res.ok) throw modelError(res.status, await res.text(), liteSwap(model));
  return (await res.json()).message.content;
}

/** One streamed /v1/chat/completions call; collects text and tool calls. */
async function streamChat({ model, think, messages, tools, signal, onToken = () => {}, onReasoning = () => {}, provider, providers, store }) {
  const body = { model, messages, stream: true, stream_options: { include_usage: true }, temperature: think ? 0.6 : 0.5 };
  if (tools?.length) body.tools = tools;
  const send = (b) => (provider
    ? providers.request(provider, '/chat/completions', provider.preset === 'ollama' ? { ...b, reasoning_effort: think ? 'high' : 'none' } : b, signal)
    // Local Ollama: reasoning_effort none skips Qwen's slow "thinking" pass unless the user asked to think harder.
    : fetch(`${OLLAMA}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      // presence_penalty: Qwen's advice against endless repetition (seen in long Tamil answers from the small model).
      body: JSON.stringify({ ...b, reasoning_effort: think ? 'high' : 'none', presence_penalty: 1 }) }));
  let res = await send(body);
  if (!res.ok && body.tools) {
    const err = await res.text();
    // Some models cannot call tools: remember that and answer without them.
    if (res.status === 400 && /tool|function/i.test(err)) {
      store?.setSetting('noToolModels', [...new Set([...store.getSetting('noToolModels', []), model])]);
      delete body.tools;
      res = await send(body);
    } else throw modelError(res.status, err, model);
  }
  if (!res.ok) throw modelError(res.status, await res.text(), model);

  let content = '';
  let usage = null;
  const calls = [];
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      const chunkJson = JSON.parse(line.slice(5));
      if (chunkJson.usage) usage = chunkJson.usage;
      const delta = chunkJson.choices?.[0]?.delta || {};
      const reasoning = delta.reasoning ?? delta.reasoning_content;
      if (reasoning) onReasoning(reasoning);
      if (delta.content) { content += delta.content; onToken(delta.content); }
      for (const tc of delta.tool_calls || []) {
        const slot = (calls[tc.index ?? calls.length] ??= { id: tc.id, type: 'function', function: { name: '', arguments: '' } });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.function.name += tc.function.name;
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
      }
    }
  }
  return { content, toolCalls: calls.filter(Boolean), usage };
}
