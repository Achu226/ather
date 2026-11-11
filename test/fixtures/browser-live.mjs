// Run by test/browser.test.js inside Electron: Maya's browser against a small local page (no internet, no saved session).
import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { createBrowser } from '../../src/main/services/browser.js';

const PAGES = {
  '/': `<title>Maya test page</title><h1>Hello</h1><label>Name <input id="name"></label><label>Password <input type="password"></label><a href="/two">Next page</a>`,
  '/two': '<title>Two</title><p>Page two</p>',
};
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(PAGES[req.url] ?? 'missing'); });

app.whenReady().then(async () => {
  const out = {};
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const browser = createBrowser({ BrowserWindow, partition: 'maya-test' }); // in memory only
    const first = await browser.open(`http://127.0.0.1:${server.address().port}/`);
    out.title = first.title;
    out.elements = first.elements;
    const n = (label) => Number(first.elements.split('\n').find((l) => l.includes(label)).split(' ')[0]);
    try { await browser.type(n('(password)'), 'secret'); } catch (e) { out.passwordError = e.message; }
    await browser.type(n('field: Name'), 'Asha');
    const read = await browser.read();
    out.typed = read.elements.match(/Name = "([^"]*)"/)?.[1];
    out.afterClick = (await browser.click(n('Next page'))).text;
    out.afterBack = (await browser.back()).title;
    browser.close();
  } catch (e) {
    out.error = e.stack;
  }
  console.log(`RESULT ${JSON.stringify(out)}`);
  server.close();
  app.exit(0);
});
