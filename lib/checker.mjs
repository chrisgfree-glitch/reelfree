// Shared link-check logic (used by scripts/check-links.mjs and the Vercel cron in api/cron-check.mjs).
export const HIDE_AFTER = 2;
const UA = 'Mozilla/5.0 (compatible; ReelFreeLinkChecker/1.0; +https://reelfree.net/about)';
const VIDEO_RE = /\.(mp4|m4v|ogv|webm|mkv|avi|mpe?g|mov)$/i;
const norm = (s) => s.toLowerCase()
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/&quot;/g, '"')
  .replace(/[^a-z0-9]+/g, ' ').trim();

async function fetchT(url, opts = {}, ms = 25000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en-US', ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

async function checkArchive(t) {
  const r = await fetchT(`https://archive.org/metadata/${encodeURIComponent(t.archiveId)}`);
  if (r.status !== 200) return [false, `metadata HTTP ${r.status}`];
  const m = await r.json();
  if (!m || !m.metadata) return [false, 'item not found'];
  if (m.is_dark) return [false, 'item is dark (withdrawn)'];
  const vids = (m.files || []).filter((f) => VIDEO_RE.test(f.name || '') || /mpeg4|h\.264|ogg video|matroska|webm/i.test(f.format || ''));
  if (!vids.length) return [false, 'no video file in item'];
  return [true, `${vids.length} video file(s)`];
}

async function checkYouTube(t) {
  const u = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + t.youtubeId)}`;
  const r = await fetchT(u);
  if (r.status === 404) return [false, 'oEmbed 404 (removed or private)'];
  if (r.status === 401 || r.status === 403) return [false, `oEmbed ${r.status} (embedding disabled or private)`];
  if (r.status !== 200) return [false, `oEmbed HTTP ${r.status}`];
  const j = await r.json();
  return [true, `by ${j.author_name}`];
}

async function checkPage(t) {
  const r = await fetchT(t.url, { redirect: 'follow' });
  if (r.status !== 200) return [false, `HTTP ${r.status}`];
  const html = await r.text();
  const head = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  const og = (html.match(/property="og:title"\s+content="([^"]*)"/i) || [])[1] || '';
  const want = norm(t.title);
  const img = (html.match(/property="og:image"\s+content="([^"]+)"/i) || [])[1];
  if (norm(head).includes(want) || norm(og).includes(want)) return [true, 'title present', img ? img.replace(/&amp;/g, '&').replace('w1200-q80', 'w600-q80') : null];
  return [false, `title not found on page (landed on ${r.url})`];
}

async function checkCommons(t) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|mediatype&titles=${encodeURIComponent(t.commonsFile)}`;
  const r = await fetchT(u);
  if (r.status !== 200) return [false, `Commons API HTTP ${r.status}`];
  const p = Object.values((await r.json()).query?.pages || {})[0] || {};
  if (p.missing !== undefined || !p.imageinfo) return [false, 'file missing on Commons'];
  const lic = p.imageinfo[0].extmetadata?.LicenseShortName?.value || '';
  if (!/public domain|^pd|cc0/i.test(lic)) return [false, `license is "${lic}", not public domain`];
  return [true, `Commons file, ${lic}`];
}

async function checkLoc(t) {
  const r = await fetchT(`https://www.loc.gov/item/${encodeURIComponent(t.locItem)}/?fo=json`);
  if (r.status !== 200) return [false, `loc.gov HTTP ${r.status}`];
  const d = await r.json();
  if (!d.item) return [false, 'item not found'];
  const img = (d.item.image_url || d.image_url || []).slice(-1)[0];
  return [true, 'LoC item present', img || null];
}

async function checkPlex(t) {
  const [ok, detail, img] = await checkPage(t);
  if (!ok) return [ok, detail];
  const r = await fetchT(t.url); const html = await r.text();
  const head = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
  return /free on plex/i.test(head) ? [true, 'free on Plex', img] : [false, 'no longer free on Plex'];
}

const TMDB_OK = new Set(['Tubi TV', 'Pluto TV', 'Plex', 'Plex Channel', 'Fandango at Home Free', 'YouTube Free']);
async function checkTmdb(t) {
  const token = process.env.TMDB_READ_TOKEN || process.env.tmdb_read_token, key = process.env.TMDB_API_KEY;
  if (!token && !key) return [true, 'skipped: no TMDB credentials'];
  const u = new URL(`https://api.themoviedb.org/3/${t.tmdbKind}/${t.tmdbId}/watch/providers`);
  if (!token) u.searchParams.set('api_key', key);
  const r = await fetchT(u, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (r.status !== 200) return [false, `TMDB HTTP ${r.status}`];
  const us = (await r.json()).results?.US || {};
  const ok = [...(us.free || []), ...(us.ads || [])].map((p) => p.provider_name).filter((n) => TMDB_OK.has(n));
  return ok.length ? [true, `free/ads on ${[...new Set(ok)].join(', ')}`] : [false, 'no longer free/ads on an allowed US service'];
}

const CHECKERS = { archive: checkArchive, youtube: checkYouTube, tubi: checkPage, pluto: checkPage, commons: checkCommons, loc: checkLoc, plex: checkPlex, tmdb: checkTmdb };

export async function check(t) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [ok, detail, image] = await CHECKERS[t.source](t);
      if (ok) return [true, detail, image];
      last = detail;
    } catch (e) { last = `error: ${e.name === 'AbortError' ? 'timeout' : e.message}`; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [false, last];
}


export async function runChecks(titles, status, { only = null, concurrency = 4 } = {}) {
  status = status && status.titles ? status : { titles: {} };
  const now = new Date().toISOString();
  const results = [];
  const queue = titles.filter((t) => !only || only.has(t.id));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const t = queue.shift();
      const [ok, detail, image] = await check(t);
      const prev = status.titles[t.id] || { consecutiveFailures: 0 };
      const fails = ok ? 0 : (prev.consecutiveFailures || 0) + 1;
      status.titles[t.id] = { ok, hidden: fails >= HIDE_AFTER, consecutiveFailures: fails, lastChecked: now, lastOk: ok ? now : prev.lastOk || null, detail };
      if (image || prev.image) status.titles[t.id].image = image || prev.image; // nightly artwork refresh (Tubi/Pluto og:image)
      results.push({ id: t.id, source: t.source, ok, fails, detail });
    }
  }));
  for (const id of Object.keys(status.titles)) if (!titles.find((t) => t.id === id)) delete status.titles[id];
  status.updated = now; status.hideAfter = HIDE_AFTER;
  results.sort((a, b) => a.id.localeCompare(b.id));
  const failing = results.filter((r) => !r.ok);
  const hidden = Object.entries(status.titles).filter(([, s]) => s.hidden).map(([id]) => id);
  const lines = [`ReelFree link check ${now}`, `checked ${results.length}, passed ${results.length - failing.length}, failing ${failing.length}, hidden ${hidden.length}`];
  for (const r of failing) lines.push(`FAIL ${r.id} [${r.source}] x${r.fails}: ${r.detail}`);
  return { status, results, failing, hidden, summary: lines.join('\n') };
}
