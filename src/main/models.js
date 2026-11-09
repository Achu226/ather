// Which LLM answers which question.
import { hasModel } from './ollama.js';

export const MODES = {
  fast: { model: 'ather-brain', label: 'Fast · Qwen 3.5 4B' },
  think: { model: 'ather-brain', think: true, label: 'Think harder · Qwen 3.5 4B + reasoning' },
  smart: { model: 'ather-smart', base: 'qwen3.5:9b', label: 'Smart · Qwen 3.5 9B' },
  coder: { model: 'qwen2.5-coder:7b', label: 'Coder · Qwen 2.5 Coder 7B' },
  // Hard reasoning (maths, logic, "step by step"): the 9B thinks before it answers. Slower, so only for these.
  deep: { model: 'ather-smart', base: 'qwen3.5:9b', think: true, label: 'Deep think · Qwen 3.5 9B + reasoning' },
  // The 4B fits fully on a 6 GB GPU; agents make many calls, so speed matters more than the 9B's extra polish.
  agent: { model: 'ather-brain', agent: true, label: 'Agent · plans and does multi-step tasks' },
  // Builds software end to end: the Supervisor plans, then Engineer, QA and DevOps steps run with their own tools.
  builder: { model: 'ather-smart', base: 'qwen3.5:9b', agent: true, builder: true, label: 'Builder · Supervisor → Engineer → QA → DevOps' },
};

const ACTION = /^\s*(please\s+)?(add|remind|note|save|set|delete|remove|start|stop|mark|complete|schedule|open|launch|find|draw|blur|undo|check|track|remember|forget|play|pause|lock|turn|mute)\b/i;
// Writing or fixing code goes to the coder model; merely mentioning a language ("compare Python and Java") does not.
const CODE = /```|\b(write|fix|debug|refactor|optimi[sz]e|review|complete) (a |an |the |my |this )?(\w+ )?(code|program|function|script|query|class|method|regex)|\b(error|exception|traceback|bug|stack ?trace|syntax|compile|segfault|not working)\b|\b(code|program|function|script) (to|that|for)\b/i;
const HARD = /\b(solve|prove|derive|step[- ]by[- ]step|puzzle|riddle|logic(al)?|reason it out|think (hard|carefully|deeply)|how many ways|probability|equation|integral|derivative)\b|\d+\s*[x×*\/^]\s*\d+.*[=?]/i;
const STEP_VERBS =/\b(open|send|download|save|move|copy|play|search|find|write|create|make|add|set|turn|close|call|reply|read|summari[sz]e|email|message|whatsapp|book|check|start|share|upload|rename|delete|remind)\b/gi;
/** Two or more different actions joined by "and / then / after that" (exported for tests). */
export const multiStep = (text) => /\b(and|then|after that|and then)\b/i.test(text) && new Set((text.match(STEP_VERBS) || []).map((v) => v.toLowerCase())).size >= 2;
const CODING =/\b(code|coding|bug|tests?|npm|pip|python|javascript|project|function|script|compile|build|error|exception|traceback|repo|\.js|\.py)\b/i;
const BUILD =/\b(build|make|create|code|develop)\b.{0,40}\b(website|web ?page|web ?app|web ?site|app|application|game|program|project|portfolio|landing page|calculator)\b/i;
const DEEP =/\b(explain|why|how (does|do|is|are)|compare|difference|essay|analy[sz]e|describe|write|plan|pros and cons|teach|in detail|step by step|summari[sz]e)\b/i;

/** Pure routing rule (tested): which mode "auto" picks for a question. */
export function autoMode(text, { images = 0, style = 'short' } = {}) {
  // "Build me a counter website" (typed or said): the Builder team, whichever window it came from.
  if (!images && BUILD.test(text)) return 'builder';
  // A job of several steps ("open WhatsApp and download the video, then move it to the desktop"): the agent plans and does each.
  if (!images && multiStep(text)) return 'agent';
  if (!images && HARD.test(text) && !ACTION.test(text)) return 'deep';
  if (images || ACTION.test(text) || style !== 'chat') return 'fast';
  if (CODE.test(text)) return 'coder';
  if (DEEP.test(text) || text.length > 160) return 'smart';
  return 'fast';
}

const seen = new Map(); // model name -> { ok, at }
async function installed(name) {
  const hit = seen.get(name);
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  const ok = await hasModel(name).catch(() => false);
  seen.set(name, { ok, at: Date.now() });
  return ok;
}

/** "p:openai:gpt-4o-mini" → { provider: 'openai', model: 'gpt-4o-mini' }, else null. */
export function parseProviderModel(mode) {
  const m = /^p:([\w-]+):(.+)$/.exec(mode || '');
  return m ? { provider: m[1], model: m[2] } : null;
}

/**
 * Resolve a mode ("auto", "fast", …, or "p:<provider>:<model>") to a model.
 * opts.hybrid: a "p:…" choice used instead of the local smart model for big questions (cloud when allowed).
 */
// Lite brain for slower PCs (no 4 GB graphics card, or little RAM): every local Qwen model is swapped for the 2B.
export const LITE = { model: 'ather-lite', base: 'qwen3.5:2b' };
let lite = false;
export const setLite = (on) => { lite = !!on; };
export const isLite = () => lite;
/** The model to really use: Maya's local models become the lite one while Lite is on. Exported for tests. */
export const liteSwap = (model) => (lite && /^(ather-(brain|smart)|qwen)/.test(model || '') ? LITE.model : model);

export async function pickModel(mode = 'auto', text = '', opts = {}) {
  const choice = await pick(mode, text, opts);
  return choice.provider || !lite ? choice : { ...choice, model: liteSwap(choice.model), label: `${choice.label.split('·')[0].trim()} · Lite (Qwen 3.5 2B)` };
}

async function pick(mode, text, opts) {
  const direct = parseProviderModel(mode);
  if (direct) return { key: 'custom', ...direct, label: `${direct.model} · ${direct.provider}` };
  let key = mode === 'auto' || !MODES[mode] ? autoMode(text, opts) : mode;
  const hybrid = mode === 'auto' && (key === 'smart' || key === 'coder') ? parseProviderModel(opts.hybrid) : null;
  if (hybrid) return { key: 'custom', ...hybrid, label: `${hybrid.model} · ${hybrid.provider}` };
  // A coding goal (fix a bug, run the tests) needs the 9B, like the Builder: the 4B edits files with shell commands.
  if (key === 'agent') return CODING.test(text) && (await installed(MODES.smart.model)) ? { key, ...MODES.agent, model: MODES.smart.model, label: 'Agent · coding (Qwen 3.5 9B)' } : { key, ...MODES.agent };
  if (key === 'builder') return { key, ...MODES.builder, model: (await installed(MODES.builder.model)) ? MODES.builder.model : 'ather-brain' };
  if (key !== 'fast' && !(await installed(MODES[key].model))) key = mode === 'think' || key === 'deep' ? 'think' : 'fast';
  return { key, ...MODES[key] };
}

export async function availableModes() {
  return Promise.all(Object.entries(MODES).map(async ([key, m]) => ({ key, label: m.label, installed: await installed(m.model) })));
}
