// QA for websites the Builder makes: loads the page in a hidden window and reports what a tester would see.
import { existsSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { imagesDir } from '../paths.js';

/** BrowserWindow is passed in so tests can run this inside Electron only. */
export function createQa({ BrowserWindow }) {
  return {
    async checkSite(dir, page = 'index.html') {
      const file = join(dir, page);
      if (!existsSync(file)) return { ok: false, errors: [`${page} does not exist in ${dir}`] };
      const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { sandbox: true, javascript: true } });
      const errors = [], warnings = [];
      win.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
        const where = sourceId ? ` (${sourceId.split('/').pop()}:${lineNumber})` : '';
        if (level === 'error') errors.push(`${message}${where}`);
        else if (level === 'warning') warnings.push(`${message}${where}`);
      });
      win.webContents.on('did-fail-load', (_, code, desc, url) => errors.push(`Could not load ${url}: ${desc}`));
      try {
        await win.loadFile(file);
        await new Promise((r) => setTimeout(r, 1200)); // let scripts run
        const facts = await win.webContents.executeJavaScript(`({
          title: document.title,
          text_chars: document.body ? document.body.innerText.trim().length : 0,
          headings: [...document.querySelectorAll('h1,h2')].slice(0, 8).map((h) => h.innerText.trim()),
          images_missing: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
          links: document.links.length,
          has_viewport: !!document.querySelector('meta[name=viewport]'),
        })`);
        // Outside the project, so the screenshot never ends up in the user's Git commit.
        const shot = join(imagesDir, `qa-${basename(dir)}-${Date.now()}.png`);
        writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
        if (!facts.title) warnings.push('The page has no <title>.');
        if (!facts.has_viewport) warnings.push('No <meta name="viewport">: it will look tiny on phones.');
        if (facts.text_chars < 40) errors.push('The page is (almost) empty.');
        for (const src of facts.images_missing) errors.push(`Image not found: ${src}`);
        return { ok: errors.length === 0, errors: errors.slice(0, 20), warnings: warnings.slice(0, 10), ...facts, screenshot: shot };
      } finally {
        win.destroy();
      }
    },
  };
}
