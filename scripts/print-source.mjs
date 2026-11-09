// Prints docs/CODE_GUIDE.md + docs/SOURCE-LISTING.md as one PDF for the project guide: docs/Maya-source-code.pdf
// Usage: node scripts/pack-source.mjs && npx electron scripts/print-source.mjs
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = fileURLToPath(new URL('..', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const md = (f) => marked.parse(readFileSync(join(root, 'docs', f), 'utf8'));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font: 10.5pt 'Segoe UI', Arial, sans-serif; color: #111; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; }
  .cover h1 { font-size: 30pt; margin: 0 0 6px; } .cover h2 { font-weight: 400; margin: 0 0 30px; border: 0; }
  .cover table { margin: 20px auto; border-collapse: collapse; } .cover td { padding: 3px 14px; text-align: left; }
  h1 { font-size: 17pt; page-break-before: always; } h2 { font-size: 13pt; margin-top: 20px; border-bottom: 1px solid #999; }
  h3 { font-size: 10.5pt; margin: 16px 0 4px; background: #eee; padding: 4px 6px; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; font-size: 9pt; } th, td { border: 1px solid #bbb; padding: 3px 5px; vertical-align: top; }
  a { color: inherit; text-decoration: none; }
  pre { font: 7.6pt Consolas, 'Courier New', monospace; white-space: pre-wrap; word-break: break-all; margin: 0; line-height: 1.3; }
</style></head><body>
<div class="cover">
  <h1>AETHER</h1>
  <h2>Adaptive Ecosystem for Task Handling and Empowering Rehabilitation</h2>
  <p>Source code — version ${version}</p>
  <table>
    <tr><td><b>College</b></td><td>P.T. Lee Chengalvaraya Naicker Polytechnic College, Vepery, Chennai</td></tr>
    <tr><td><b>Department</b></td><td>Computer Engineering, batch 2024–2027</td></tr>
    <tr><td><b>Team</b></td><td>Ronald S (25508836), Ahamed Hafeez S (25508797), Harish P (25508807), Nithish S (25508826)</td></tr>
    <tr><td><b>Project guide</b></td><td>Er. A. Gowtham, B.Tech (IT), Lecturer</td></tr>
  </table>
</div>
${md('CODE_GUIDE.md')}
${md('SOURCE-LISTING.md')}
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  const tmp = join(root, 'docs', '_print.html');
  writeFileSync(tmp, html);
  await win.loadFile(tmp);
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666">AETHER ${version} source code — page <span class="pageNumber"></span> of <span class="totalPages"></span></div>` });
  writeFileSync(join(root, 'docs', 'Maya-source-code.pdf'), pdf);
  (await import('node:fs')).rmSync(tmp);
  console.log(`docs/Maya-source-code.pdf: ${Math.round(pdf.length / 1024)} KB`);
  app.quit();
});
