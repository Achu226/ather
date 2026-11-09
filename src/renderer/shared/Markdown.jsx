import { useEffect, useMemo, useRef } from 'react';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';

const marked = new Marked({ gfm: true, breaks: true }).use(markedKatex({ throwOnError: false, nonStandard: true }));

/** Renders an AI answer as Markdown (code, tables, maths). Model output is untrusted, so it is sanitised. */
export default function Markdown({ text }) {
  const ref = useRef(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text || '')), [text]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const pre of root.querySelectorAll('pre')) {
      if (pre.querySelector('.copy-code')) continue;
      const btn = document.createElement('button');
      btn.className = 'copy-code';
      btn.textContent = 'Copy';
      btn.onclick = () => { navigator.clipboard.writeText(pre.innerText.replace(/Copy$/, '')); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
      pre.appendChild(btn);
    }
  }, [html]);

  // Links open in the real browser, never inside Maya.
  const onClick = (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    window.ather.openExternal(a.href);
  };

  return <div className="md" ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
