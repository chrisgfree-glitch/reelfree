// Serves the title page with per-title Open Graph / Twitter tags so shared links preview with artwork.
// Same HTML as before; only <title> and meta tags are filled in server-side.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.cwd();
const HTML = readFileSync(join(ROOT, 'tpl/title.html'), 'utf8');
const TITLES = JSON.parse(readFileSync(join(ROOT, 'data/titles.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export default function handler(req, res) {
  const id = String(req.query.id || '');
  const t = TITLES.find((x) => x.id === id);
  let html = HTML;
  if (t) {
    const url = `https://reelfree.net/title/${encodeURIComponent(t.id)}`;
    const title = `${t.title} (${t.year}) · Watch free on ReelFree`;
    const desc = (t.description || 'ReelFree: the only real free way to watch.').slice(0, 200);
    const img = t.image || 'https://reelfree.net/icons/icon-512.png';
    const meta = [
      `<meta property="og:type" content="${t.type === 'tv' ? 'video.tv_show' : 'video.movie'}">`, `<meta property="og:site_name" content="ReelFree">`,
      `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(url)}">`, `<meta property="og:image" content="${esc(img)}">`,
      `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`, `<meta name="twitter:image" content="${esc(img)}">`,
      `<link rel="canonical" href="${esc(url)}">`].join('');
    html = html.replace('<title>ReelFree</title>', `<title>${esc(title)}</title>`)
      .replace('<meta name="description" content="Watch free and legally on ReelFree.">', `<meta name="description" content="${esc(desc)}">${meta}`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(t ? 200 : 404).send(html);
}
