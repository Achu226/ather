// Makes real Office/PDF files from AI output: PowerPoint (.pptx), Word (.docx) and PDF.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';
import { marked } from 'marked';

const safeName = (s) => (s || 'Maya').replace(/[<>:"/\\|?*\n]+/g, ' ').trim().slice(0, 60) || 'Maya';

/** "**bold** text" → docx runs. */
const runs = (text) => text.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
  .map((part) => (part.startsWith('**') ? new TextRun({ text: part.slice(2, -2), bold: true }) : new TextRun(part.replace(/[*_`]/g, ''))));

/** Simple Markdown (headings, bullets, numbers, tables, paragraphs) → docx blocks. Exported for tests. */
export function markdownToDocx(markdown) {
  const blocks = [];
  let table = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map((cells, i) => new TableRow({ children: cells.map((c) => new TableCell({ children: [new Paragraph({ children: i === 0 ? [new TextRun({ text: c, bold: true })] : runs(c) })] })) })),
    }));
    table = [];
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('|')) { table.push(line.trim()); continue; }
    flushTable();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) blocks.push(new Paragraph({ text: h[2], heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][h[1].length - 1] }));
    else if (/^\s*[-*•]\s+/.test(line)) blocks.push(new Paragraph({ children: runs(line.replace(/^\s*[-*•]\s+/, '')), bullet: { level: 0 } }));
    else if (/^\s*\d+[.)]\s+/.test(line)) blocks.push(new Paragraph({ children: runs(line.replace(/^\s*\d+[.)]\s+/, '')), bullet: { level: 0 } }));
    else blocks.push(new Paragraph({ children: runs(line), spacing: { after: 120 } }));
  }
  flushTable();
  return blocks;
}

export function createFiles({ outDir, imaging, printPdf }) {
  const out = (name, ext) => { mkdirSync(outDir, { recursive: true }); return join(outDir, `${safeName(name)}-${Date.now().toString(36)}.${ext}`); };

  /** slides: [{ title, bullets: [], notes }]. images: draw a picture for up to 5 slides with SD-Turbo. */
  async function presentation({ title, subtitle = '', slides = [], images = false, theme = 'purple' }) {
    if (!slides.length) throw new Error('A presentation needs at least one slide.');
    const colors = theme === 'dark' ? { bg: '111114', title: 'FFFFFF', text: 'D8D8E0', accent: '8B7DFF' } : { bg: 'FFFFFF', title: '1D1638', text: '3D3858', accent: '6C5CFF' };
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = title;

    const cover = pptx.addSlide();
    cover.background = { color: colors.accent };
    cover.addText(title, { x: 0.6, y: 2.3, w: 12, h: 1.4, fontSize: 40, bold: true, color: 'FFFFFF', fontFace: 'Segoe UI' });
    if (subtitle) cover.addText(subtitle, { x: 0.6, y: 3.7, w: 12, h: 0.8, fontSize: 20, color: 'EDEBFF', fontFace: 'Segoe UI' });

    for (const [i, s] of slides.entries()) {
      const slide = pptx.addSlide();
      slide.background = { color: colors.bg };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: colors.accent } });
      slide.addText(s.title || `Slide ${i + 1}`, { x: 0.6, y: 0.35, w: 12, h: 0.9, fontSize: 30, bold: true, color: colors.title, fontFace: 'Segoe UI' });
      let picture = null;
      if (images && i < 5 && imaging) picture = await imaging.generate(`${s.title}, ${title}, clean illustration`).catch(() => null);
      const textWidth = picture ? 7.2 : 12;
      slide.addText((s.bullets || []).map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.7, y: 1.4, w: textWidth, h: 5.4, fontSize: 20, color: colors.text, fontFace: 'Segoe UI', valign: 'top', paraSpaceAfter: 10 });
      if (picture) slide.addImage({ path: picture.path, x: 8.2, y: 1.5, w: 4.6, h: 4.6 });
      if (s.notes) slide.addNotes(s.notes);
    }
    const path = out(title, 'pptx');
    await pptx.writeFile({ fileName: path });
    return { path, slides: slides.length + 1 };
  }

  async function document({ title, markdown }) {
    const doc = new Document({
      creator: 'Maya', title,
      sections: [{ children: [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...markdownToDocx(markdown)] }],
    });
    const path = out(title, 'docx');
    writeFileSync(path, await Packer.toBuffer(doc));
    return { path };
  }

  async function pdf({ title: rawTitle, markdown }) {
    const title = String(rawTitle).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body { font-family: 'Segoe UI', sans-serif; color: #1d1638; margin: 40px 48px; line-height: 1.5; font-size: 12pt; }
      h1 { color: #4a3ad6; border-bottom: 3px solid #6c5cff; padding-bottom: 6px; }
      h2 { color: #4a3ad6; margin-top: 1.4em; } table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; } th { background: #efecff; }
      code { background: #f2f0fb; padding: 1px 4px; border-radius: 4px; } pre { background: #1d1638; color: #fff; padding: 10px; border-radius: 8px; white-space: pre-wrap; }
    </style></head><body><h1>${title}</h1>${marked.parse(markdown)}</body></html>`;
    const path = out(rawTitle, 'pdf');
    writeFileSync(path, await printPdf(html));
    return { path };
  }

  return { presentation, document, pdf };
}
