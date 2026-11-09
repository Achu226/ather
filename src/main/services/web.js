const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

/** Top web results from DuckDuckGo's HTML page: [{ title, url, snippet }]. */
export async function webSearch(query, limit = 6) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Web search failed (${res.status})`);
  const html = await res.text();
  const links = [...html.matchAll(/class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  return links.slice(0, limit).map((m, i) => {
    const raw = decode(m[1]);
    const url = raw.includes('uddg=') ? decodeURIComponent(raw.split('uddg=')[1].split('&')[0]) : raw;
    return { title: decode(m[2]), url, snippet: decode(snippets[i]?.[1] || '') };
  });
}

/** Readable text of a web page, trimmed for the AI. */
export async function readPage(url, maxChars = 6000) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) pages can be read');
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Could not open the page (${res.status})`);
  const html = await res.text();
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url);
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|br|tr)>/gi, '\n');
  const text = decode(body).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { title, url, text: text.slice(0, maxChars) };
}
