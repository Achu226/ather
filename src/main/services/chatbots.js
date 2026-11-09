// "Ask ChatGPT / ask Claude …" for people who cannot type: open the prompt in the user's own browser (where they
// are signed in), send it, wait until the answer stops growing, and hand the answer back to be read aloud.
// A human check ("verify you are human") is never answered by Maya: the user is told instead.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SITES = {
  chatgpt: { name: 'ChatGPT', url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, title: /chatgpt/i, footer: /ChatGPT (is AI and )?can make mistakes[\s\S]*$/i },
  claude: { name: 'Claude', url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, title: /claude/i, footer: /Claude (is AI and )?can make mistakes[\s\S]*$/i },
};

const sent = (page, prompt) => page.split(prompt.trim().slice(0, 60)).length - 1;

/**
 * The answer in the page text: what follows the user's sent message, up to the site's footer (exported for tests).
 * The prompt can also still sit in the text box further down; the first copy is the sent one.
 */
export function answerIn(page, prompt, site) {
  const key = prompt.trim().slice(0, 60);
  const at = page.indexOf(key);
  if (at < 0) return '';
  const after = page.slice(at + key.length).replace(prompt.trim().slice(60), '');
  const footer = after.search(SITES[site].footer);
  return (footer >= 0 ? after.slice(0, footer) : '').replace(/￼/g, '')
    .replace(/^\s*(ChatGPT said:|Claude said:|Copy|Copy response|Edit|Retry|Good response|Bad response|Share|More actions|Read aloud)\s*$/gim, '').trim().slice(0, 4000);
}

/** pc: the PC helper; open(url) opens the user's default browser. */
export async function askChatbot({ pc, open, site, prompt, timeoutMs = 120_000, poll = 2000 }) {
  const s = SITES[site];
  if (!s) throw new Error('site must be chatgpt or claude');
  await open(s.url(prompt));
  // Wait for the browser to show the site.
  let fg;
  for (let i = 0; i < 15; i++) { await sleep(1000); fg = await pc.foreground(); if (s.title.test(fg.title)) break; }
  if (!s.title.test(fg?.title || '')) return { site: s.name, error: `${s.name} did not open in the browser.` };
  const start = Date.now();
  let last = '', same = 0, pressed = false;
  while (Date.now() - start < timeoutMs) {
    await sleep(poll);
    const page = String(await pc.readText().catch(() => ''));
    if (/verify you are human|are you a robot|captcha/i.test(page)) return { site: s.name, error: `${s.name} is asking to check that you are human. Please do that on the screen, then ask again.` };
    // The sign-in buttons show before the question does, so only give up once the question never appeared.
    if (Date.now() - start > 15_000 && /log ?in|sign ?up|continue with google/i.test(page) && !page.includes(prompt.slice(0, 30))) return { site: s.name, error: `Please sign in to ${s.name} in your browser once, then ask again.` };
    const answer = answerIn(page, prompt, site);
    if (/temporarily experiencing issues|something went wrong|network error|too many requests/i.test(answer)) return { site: s.name, error: `${s.name} says: ${answer.split('\n')[0]}` };
    // The prompt is only in the box, not sent yet (Claude only fills it in): press Enter once.
    if (!answer && !pressed && sent(page, prompt) < 2 && Date.now() - start > 5000) { await pc.activate(fg.hwnd); await pc.keys('{ENTER}'); pressed = true; continue; }
    same = answer && answer === last ? same + 1 : 0;
    last = answer;
    if (same >= 2 && answer.length > 2) return { site: s.name, answer };
  }
  return last ? { site: s.name, answer: last, note: 'It may still be writing; this is what it had so far.' } : { site: s.name, error: `No answer from ${s.name} within ${timeoutMs / 1000} seconds.` };
}
