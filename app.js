// ReelFree front end. Plain ES module, no build step.
const CFG = window.REELFREE_CONFIG || {};
const SOURCES = {
  archive: { label: 'Internet Archive', short: 'Archive' },
  youtube: { label: 'YouTube (official)', short: 'YouTube' },
  tubi: { label: 'Tubi', short: 'Tubi' },
  pluto: { label: 'Pluto TV', short: 'Pluto TV' },
  commons: { label: 'Wikimedia Commons', short: 'Commons' },
  loc: { label: 'Library of Congress', short: 'LoC' },
  plex: { label: 'Plex', short: 'Plex' },
  tmdb: { label: 'Free streaming (via TMDB)', short: 'Free' },
};
const srcShort0 = (t) => (t.source === 'tmdb' && t.providers && t.providers[0]) || SOURCES[t.source].short;
const srcShort = (t) => srcShort0(t) === 'The Roku Channel' ? 'Roku Channel' : srcShort0(t);
const srcLabel = (t) => (t.source === 'tmdb' && t.providers && t.providers.length) ? t.providers.join(', ') : SOURCES[t.source].label;
const yearsOf = (t) => t.type === 'tv' && t.lastAirDate ? `${t.year}–${t.endYear || ''}` : `${t.year}`;
// How each source plays, based on observed response headers (see README "Playback").
// inline: official embed player; frame: full source page in an in-site viewer; tab: new tab (framing blocked).
const PLAYBACK = { archive: 'inline', youtube: 'inline', commons: 'inline', pluto: 'frame', tubi: 'tab', loc: 'tab', plex: 'tab', tmdb: 'tab' };

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function getJSON(url, ms = 4000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal, cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

async function loadData() {
  const titles = await getJSON('/data/titles.json', 10000);
  let status = { titles: {} };
  // Nightly checker commits status.json to GitHub; read the live copy so hiding works without a redeploy.
  try { status = await getJSON(`https://raw.githubusercontent.com/${CFG.repo}/main/data/status.json`); }
  catch { try { status = await getJSON('/data/status.json'); } catch {} }
  const isHidden = (id) => !!(status.titles && status.titles[id] && status.titles[id].hidden);
  return { titles, status, isHidden };
}

let IMG = {};
const isNew = (t) => t.addedAt && (Date.now() - Date.parse(t.addedAt)) < 7 * 864e5;
function card(t) {
  const img = IMG[t.id] || t.image;
  return `<a class="card${img ? '' : ' noimg'}" href="/title/${esc(t.id)}">
    <span class="art">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.parentNode.classList.add('noimg');this.remove()">` : ''}<img class="fallback" src="/icons/logo-128.png" alt="" aria-hidden="true"></span>
    <span class="scrim"></span>
    <span class="badge src-${t.source}">${esc(srcShort(t))}</span>${t.fanMade ? '<span class="badge fan">Fan-made</span>' : ''}${isNew(t) ? '<span class="badge new">New this week</span>' : ''}<button class="addlist" type="button" data-add="${esc(t.id)}" aria-label="Add ${esc(t.title)} to My List">+</button>
    <span class="kind">${t.type === 'tv' ? 'TV' : 'Movie'}</span>
    <span class="info"><h3>${esc(t.title)}</h3><span class="meta">${esc(yearsOf(t))}${t.rating ? ` · ★ ${esc(t.rating)}` : ''} · ${esc(t.genre)}</span></span>
  </a>`;
}

// Rows show the first 25 in a rail; longer lists get a "See all N" toggle that swaps in a grid (keeps the page light).
const ROWS = {};
const row = (id, title, list, note = '', render = card) => {
  ROWS[id] = { list, render };
  const more = list.length > 25 ? `<button class="btn small ghost see-all" data-row="${id}">See all ${list.length}</button>` : '';
  return `<section class="row" id="${id}"><div class="row-head"><h2>${title}</h2>${note ? `<span class="muted small">${note}</span>` : ''}${more}</div>
  <div class="rail">${list.slice(0, 25).map(render).join('')}</div></section>`;
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('.see-all'); if (!b) return;
  const r = ROWS[b.dataset.row]; const box = b.closest('.row').querySelector('.rail, .grid');
  const open = box.classList.contains('rail');
  box.className = open ? 'grid' : 'rail';
  box.innerHTML = (open ? r.list : r.list.slice(0, 25)).map(r.render).join('');
  b.textContent = open ? 'Show fewer' : `See all ${r.list.length}`;
});
// Card for titles that live outside the catalog (genre browser, title requests): opens where-to-watch in a new tab.
function extCard(m) {
  return `<a class="card${m.image ? '' : ' noimg'}" href="${esc(m.url)}" target="_blank" rel="noopener" data-tmdb="${esc(m.tmdbId)}" data-genres="${esc((m.genres || []).join('|'))}">
      <span class="art">${m.image ? `<img src="${esc(m.image)}" alt="" loading="lazy" decoding="async">` : ''}<img class="fallback" src="/icons/logo-128.png" alt="" aria-hidden="true"></span>
      <span class="scrim"></span><span class="badge src-tmdb">${esc((m.providers || m.free || [])[0] || 'Free')}</span><span class="kind">${m.kind === 'tv' ? 'TV' : 'Movie'} ↗</span>
      <span class="info"><h3>${esc(m.title)}</h3><span class="meta">${esc(m.year)}${m.rating ? ` · ★ ${esc(m.rating)}` : ''} · ${esc((m.providers || m.free || []).join(', '))}</span></span></a>`;
}

async function home() {
  const { titles, isHidden, status } = await loadData();
  IMG = Object.fromEntries(Object.entries(status.titles || {}).filter(([, v]) => v.image).map(([k, v]) => [k, v.image]));
  const visible = titles.filter((t) => !isHidden(t.id));
  window.__rfTitles = visible;
  const rd = (t) => t.releaseDate || `${t.year}-01-01`;
  const newest = (a, b) => rd(b).localeCompare(rd(a)) || a.title.localeCompare(b.title);
  // Top row: movies from 2010 on only, newest first, max 25. Never backfilled with older titles.
  // Top 100 newest: TMDB-verified free (US) movies from 2010 on, newest first. Never padded.
  const top = visible.filter((t) => t.featuredRank).sort((a, b) => a.featuredRank - b.featuredRank);
  // Popular: free movies from 1970 on, ranked by TMDB rating (min vote count, see data/meta.json), tiebreak vote count.
  const pop = visible.filter((t) => t.popRank).sort((a, b) => a.popRank - b.popRank);
  $('#sections').innerHTML =
    (top.length ? row('newest', top.length >= 100 ? 'Top 100 newest' : `${top.length} newest good movies`, top, 'Free movies from 2010 on, rated ★6+ on TMDB (100+ votes), newest first') : '') +
    (pop.length ? row('popular', `Top ${pop.length} popular movies`, pop, 'Weighted TMDB rating, 1,000+ votes, 1970 on') : '') +
    row('tv', 'TV shows', visible.filter((t) => t.tvRank).sort((a, b) => a.tvRank - b.tvRank), 'Free now: sci-fi favorites and current hits') +
    row('fan', 'Fan-made Star Trek', visible.filter((t) => t.fanMade), 'Not official: free fan productions on their makers\' own YouTube channels. Star Trek is owned by CBS/Paramount and is not public domain.') +
    row('classics', 'Timeless classics', visible.filter((t) => t.year < 1970 && !t.tvRank && !t.fanMade).sort(newest), 'Before 1970: public-domain and vintage favorites');
  const genres = [...new Set(visible.map((t) => t.genre))].sort();
  $('#genre').insertAdjacentHTML('beforeend', genres.map((g) => `<option>${esc(g)}</option>`).join(''));
  const p = new URLSearchParams(location.search);
  const st = { q: p.get('q') || '', genre: p.get('genre') || '', source: p.get('source') || '', type: p.get('type') || '', from: p.get('from') || '', to: p.get('to') || '', rating: p.get('rating') || '' };
  $('#q').value = st.q; $('#genre').value = st.genre; $('#source').value = st.source; $('#from').value = st.from; $('#to').value = st.to; $('#rating').value = st.rating;
  const render = () => {
    const q = st.q.trim().toLowerCase();
    const filtering = !!(q || st.genre || st.source || st.type || st.from || st.to || st.rating);
    const list = visible.filter((t) => (!st.genre || t.genre === st.genre) && (!st.source || t.source === st.source)
      && (!st.type || t.type === st.type) && (!st.from || t.year >= +st.from) && (!st.to || t.year <= +st.to)
      && (!st.rating || (t.rating || 0) >= +st.rating)
      && (!q || `${t.title} ${t.genre} ${t.description} ${t.year}`.toLowerCase().includes(q)))
      .sort((a, b) => filtering ? (b.releaseDate || `${b.year}`).localeCompare(a.releaseDate || `${a.year}`) || a.title.localeCompare(b.title) : a.title.replace(/^(the|a|an) /i, '').localeCompare(b.title.replace(/^(the|a|an) /i, '')));
    $('#sections').hidden = filtering;
    $('#az-title').textContent = filtering ? 'Results' : 'A–Z';
    $('#grid').innerHTML = list.map(card).join('') || '<p class="muted">No titles match. Try clearing a filter.</p>';
    $('#count').textContent = `${list.length} of ${visible.length} titles`;
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.type === st.type));
    const u = new URLSearchParams(Object.entries(st).filter(([, v]) => v));
    history.replaceState(null, '', u.toString() ? `/?${u}` : '/');
  };
  $('#q').addEventListener('input', (e) => { st.q = e.target.value; render(); });
  $('#genre').addEventListener('change', (e) => { st.genre = e.target.value; render(); });
  $('#source').addEventListener('change', (e) => { st.source = e.target.value; render(); });
  for (const k of ['from', 'to', 'rating']) $('#' + k).addEventListener('input', (e) => { st[k] = e.target.value; render(); });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { st.type = b.dataset.type; render(); }));
  render();
  genreBrowser();
  requestTitle(titles);
  sportsBrowser();
  collections(visible);
  trailers();
  window.dispatchEvent(new CustomEvent('reelfree:home', { detail: { visible } }));
}

// Hand-picked collections built from verified catalog titles (chips, one collection at a time).
const inOctober = new Date().getMonth() === 9;
const COLLECTIONS = [
  ["Critics' Picks", (t) => (t.rating || 0) >= 7.5 && (t.votes || 0) >= 1000],
  ['Comedy Night', (t) => /comedy/i.test(t.genre)],
  ['Action & Martial Arts', (t) => /action/i.test(t.genre) || /kung fu|martial art|ip man/i.test(`${t.title} ${t.description}`)],
  ['Family Night', (t) => /family|animation/i.test(t.genre)],
  ['90s Rewind', (t) => t.year >= 1990 && t.year <= 1999],
  ['2000s Favorites', (t) => t.year >= 2000 && t.year <= 2009],
  ['Golden Age Classics', (t) => t.year < 1960],
  ['Sci-Fi TV Marathon', (t) => t.type === 'tv' && /sci-fi|science fiction/i.test(t.genre)],
  ['Space & Aliens', (t) => /\b(space|alien|aliens|planet|galaxy|starship|astronaut|mars|ufo)\b/i.test(`${t.title} ${t.description}`)],
  ['Documentaries', (t) => /documentary/i.test(t.genre)],
  ...(inOctober ? [['Halloween Horror', (t) => /horror/i.test(t.genre)]] : []),
];
const COLL_MIN = 8; // collections with fewer titles are hidden
function collections(visible) {
  const box = $('#collections'); if (!box) return;
  const cs = COLLECTIONS.map(([name, f]) => [name, visible.filter(f).sort((a, b) => (b.releaseDate || `${b.year}`).localeCompare(a.releaseDate || `${a.year}`))]).filter(([, l]) => l.length >= COLL_MIN);
  $('#coll-chips').innerHTML = cs.map(([n, l], i) => `<button class="chip${i ? '' : ' on'}" data-i="${i}">${esc(n)} <span>${l.length}</span></button>`).join('');
  const show = (i) => { document.querySelectorAll('#coll-chips .chip').forEach((c) => c.classList.toggle('on', +c.dataset.i === i)); $('#coll-grid').innerHTML = cs[i][1].slice(0, 60).map(card).join(''); };
  $('#coll-chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) show(+b.dataset.i); });
  if (cs.length) show(0); else box.hidden = true;
}
// Official TMDB trailers (YouTube). Click to play; nothing autoplays on load.
async function trailers() {
  const box = $('#trailers'); if (!box) return;
  let j; try { j = await getJSON('/data/trailers.json', 8000); } catch { box.hidden = true; return; }
  const tr = j.trailers || []; if (!tr.length) { box.hidden = true; return; }
  box.querySelector('.rail').innerHTML = tr.map((x) => `<button class="card trailer" type="button" data-yt="${esc(x.youtubeId)}" aria-label="Play trailer: ${esc(x.title)}">
    <span class="art"><img src="https://i.ytimg.com/vi/${esc(x.youtubeId)}/hqdefault.jpg" alt="" loading="lazy"></span><span class="scrim"></span>
    <span class="badge src-youtube">${x.upcoming ? 'Coming soon' : 'In theaters'}</span><span class="play">▶</span>
    <span class="info"><h3>${esc(x.title)}</h3><span class="meta">${esc(x.releaseDate || '')} · Trailer</span></span></button>`).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-yt]'); if (!b) return;
    const d = document.createElement('div'); d.className = 'card trailer playing';
    d.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.yt)}?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    b.replaceWith(d);
  });
}

// Sports: one sport at a time. Official YouTube playlists embed in-site (loaded only for the chosen sport);
// free FAST channels (Pluto TV, Tubi) open in a new tab.
async function sportsBrowser() {
  const box = $('#sports'); if (!box) return;
  let data; try { data = await getJSON('/data/sports.json', 10000); } catch { box.hidden = true; return; }
  const sp = data.sports || []; if (!sp.length) { box.hidden = true; return; }
  $('#sport-chips').innerHTML = sp.map((x, i) => `<button class="chip${i ? '' : ' on'}" data-i="${i}">${esc(x.sport)} <span>${x.count}</span></button>`).join('');
  const show = (i) => {
    document.querySelectorAll('#sport-chips .chip').forEach((c) => c.classList.toggle('on', +c.dataset.i === i));
    $('#sport-grid').innerHTML = sp[i].items.map((it) => it.kind === 'embed'
      ? `<div class="sport-item"><div class="player"><iframe src="${esc(it.embed)}" title="${esc(it.name)} on YouTube" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p><strong>${esc(it.name)}</strong> <span class="muted small">· ${esc(it.service)} · ${esc(it.note)}</span> <a class="small" href="${esc(it.url)}" target="_blank" rel="noopener">Channel ↗</a></p></div>`
      : it.kind === 'frame' ? `<button class="sport-tab" type="button" data-frame="${esc(it.url)}" data-name="${esc(it.name)}"><strong>${esc(it.name)}</strong><span class="muted small">${esc(it.service)} · ${esc(it.note)}</span><span class="btn small primary">▶ Watch here</span></button>`
      : `<a class="sport-tab" href="${esc(it.url)}" target="_blank" rel="noopener"><strong>${esc(it.name)}</strong><span class="muted small">${esc(it.service)} · ${esc(it.note)}</span><span class="btn small primary">Open ↗</span></a>`).join('');
  };
  $('#sport-chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) show(+b.dataset.i); });
  $('#sport-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-frame]'); if (b) openViewer({ title: b.dataset.name, url: b.dataset.frame, source: 'pluto' }); });
  show(0);
}

// "Request a title": TMDB search through /api/tmdb-search; shows where it's free, or a Notify me button.
function requestTitle(titles) {
  const f = $('#req-form'); if (!f) return;
  const byTmdb = Object.fromEntries(titles.filter((t) => t.tmdbId).map((t) => [String(t.tmdbId), t]));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const q = f.q.value.trim(); const out = $('#req-results'); if (q.length < 2) return;
    out.innerHTML = '<p class="muted small">Searching…</p>';
    try {
      const j = await getJSON(`/api/tmdb-search?q=${encodeURIComponent(q)}`, 12000);
      out.innerHTML = (j.results || []).map((r) => {
        const inCat = byTmdb[String(r.tmdbId)];
        const status = inCat ? `<a class="btn small primary" href="/title/${esc(inCat.id)}">On ReelFree: watch now</a>`
          : r.free.length ? `<a class="btn small ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Free on ${esc(r.free.join(', '))} ↗</a>`
          : '<span class="muted small">Not free on a legal service right now.</span>';
        const bell = inCat ? '' : `<button class="btn small ghost" data-notify data-type="title" data-tmdb-id="${esc(r.tmdbId)}" data-name="${esc(r.title)}">🔔 Notify me when it's on ReelFree</button>`;
        return `<div class="req-item">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : '<span class="req-noimg"></span>'}<div><strong>${esc(r.title)}</strong> <span class="muted small">${esc(r.year)} · ${r.kind === 'tv' ? 'TV' : 'Movie'}</span><div class="actions">${status}${bell}</div></div></div>`;
      }).join('') || '<p class="muted small">No matches.</p>';
      window.dispatchEvent(new Event('reelfree:rendered'));
    } catch { out.innerHTML = '<p class="muted small">Search is unavailable right now.</p>'; }
  });
}

async function genreBrowser() {
  const box = $('#genres'); if (!box) return;
  let data;
  try { data = await getJSON('/data/genres.json', 10000); } catch { box.hidden = true; return; }
  const gs = data.genres || [];
  if (!gs.length) { box.hidden = true; return; }
  $('#genre-chips').innerHTML = gs.map((g, i) => `<button class="chip${i ? '' : ' on'}" data-i="${i}">${esc(g.name)} <span>${g.count}</span></button>`).join('');
  const show = (i) => {
    const g = gs[i];
    document.querySelectorAll('#genre-chips .chip').forEach((c) => c.classList.toggle('on', +c.dataset.i === i));
    $('#genre-grid').innerHTML = g.items.map((m) => extCard({ ...m, genres: [g.name] })).join('');
    $('#genre-notify').innerHTML = `<button class="btn small ghost" data-notify data-type="genre" data-name="${esc(g.name)}" data-genre-id="${esc(g.id)}">🔔 Notify me about new ${esc(g.name)} titles</button>`;
    window.dispatchEvent(new Event('reelfree:rendered'));
  };
  $('#genre-chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) show(+b.dataset.i); });
  show(0);
}

// Best allowed free provider for TMDB-sourced titles, in a fixed order. Uses the nightly checker's provider list when present.
// Links go to each service's own search page for the title (built from the name only; nothing is fetched).
// Pluto TV has no linkable search URL, so Pluto-only titles keep TMDB's where-to-watch link.
const PICK_ORDER = ['YouTube', 'Tubi', 'Pluto TV', 'Plex', 'Fandango at Home'];
const SEARCH = {
  YouTube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' full movie free with ads')}`,
  Tubi: (q) => `https://tubitv.com/search/${encodeURIComponent(q)}`,
  Plex: (q) => `https://watch.plex.tv/search?q=${encodeURIComponent(q)}`,
  'Fandango at Home': (q) => `https://athome.fandango.com/content/browse/search?searchString=${encodeURIComponent(q)}`,
};
let STATUS = {};
function autoPick(t) {
  const prov = (STATUS[t.id] && STATUS[t.id].providers) || t.providers || [];
  const name = PICK_ORDER.find((p) => prov.includes(p) && SEARCH[p]);
  return name ? { name, url: SEARCH[name](name === 'YouTube' ? `${t.title} ${t.year}` : t.title) } : null;
}

function player(t) {
  const mode = PLAYBACK[t.source];
  const src = srcLabel(t);
  const out = `<a class="btn ghost" href="${esc(t.url)}" target="_blank" rel="noopener">Open on ${esc(src)} ↗</a>`;
  if (mode === 'inline') {
    const allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    const yt = t.source === 'youtube';
    const src2 = yt ? `${t.embedUrl}${t.embedUrl.includes('?') ? '&' : '?'}enablejsapi=1&origin=${encodeURIComponent(location.origin)}` : t.embedUrl;
    return `<div class="player"><iframe ${yt ? 'id="yt-player" ' : ''}src="${esc(src2)}" title="${esc(t.title)} (${esc(src)} player)" allow="${allow}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe></div>
      <div class="actions">${out}</div>`;
  }
  if (mode === 'frame') {
    return `<div class="actions"><button class="btn primary" id="watch-frame">▶ Watch free on ${esc(src)}</button>${out}</div>
      <p class="muted small">Plays inside ReelFree in ${esc(src)}'s own page, with their ads. If it doesn't load, use “Open on ${esc(src)}”.</p>`;
  }
  if (t.source === 'tmdb') {
    const pick = autoPick(t);
    const fallback = `<a class="small" href="${esc(t.url)}" target="_blank" rel="noopener">Other options: where to watch (TMDB/JustWatch) ↗</a>`;
    if (!pick) return `<div class="actions"><a class="btn primary" href="${esc(t.url)}" target="_blank" rel="noopener">▶ Watch free on ${esc(src)} ↗</a></div>
      <p class="muted small">Opens TMDB's where-to-watch page (powered by JustWatch) in a new tab.</p>`;
    return `<div class="actions"><a class="btn primary" href="${esc(pick.url)}" target="_blank" rel="noopener">▶ Watch free on ${esc(pick.name)} ↗</a></div>
      <p class="muted small">Opens ${esc(pick.name)}'s search for this title in a new tab (free with ads). ${fallback}</p>`;
  }
  const why = t.source === 'plex' ? 'Plex links always open in a new tab' : `${esc(src)} doesn't allow its pages to play inside other sites, so this opens ${esc(src)} in a new tab`;
  return `<div class="actions"><a class="btn primary" href="${esc(t.url)}" target="_blank" rel="noopener">▶ Watch free on ${esc(src)} ↗</a></div>
    <p class="muted small">${why}.</p>`;
}

function reportPanel(t) {
  return `<details class="report" id="report"><summary>Report broken link</summary>
    <form id="report-form" novalidate>
      <label>What's wrong?
        <select name="reason" required>
          <option value="wont-play">Video won't play</option><option value="removed">Title removed / page gone</option>
          <option value="wrong-title">Wrong title or video</option><option value="region">Not available where I am</option>
          <option value="rights">Rights concern</option><option value="other">Something else</option>
        </select></label>
      <label>Details (optional)<textarea name="note" maxlength="500" rows="3" placeholder="Anything that helps us fix it. Please don't include personal info."></textarea></label>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn primary" type="submit">Send report</button>
      <p class="small muted" id="report-msg" role="status">Anonymous. No email needed.</p>
    </form></details>`;
}

async function titlePage() {
  const id = decodeURIComponent((location.pathname.match(/\/title\/([^/?#]+)/) || [])[1] || new URLSearchParams(location.search).get('id') || '');
  const { titles, isHidden, status } = await loadData();
  const t = titles.find((x) => x.id === id);
  const st = (status.titles || {})[id] || {};
  STATUS = status.titles || {};
  const root = $('#title-root');
  if (!t) { root.innerHTML = '<h1>Title not found</h1><p><a href="/">Back to browse</a></p>'; return; }
  document.title = `${t.title} (${t.year}) · Watch free on ReelFree`;
  const hidden = isHidden(t.id);
  root.innerHTML = `
    <p class="crumbs"><a href="/">← All titles</a></p>
    <h1>${esc(t.title)} <span class="year">${esc(yearsOf(t))}</span></h1>
    <p class="meta"><span class="badge src-${t.source}">${esc(srcLabel(t))}</span> ${t.type === 'tv' ? 'TV' : 'Movie'} · ${esc(t.genre)}</p>
    ${!hidden && PLAYBACK[t?.source] !== 'inline' && (st.image || t.image) ? `<div class="poster"><img src="${esc(st.image || t.image)}" alt="${esc(t.title)} artwork from ${esc(SOURCES[t.source].label)}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
    <div class="actions share-row"><button class="btn small ghost" id="share-btn">Share</button><span class="small muted" id="share-msg" role="status"></span></div>
    ${hidden ? '<p class="notice">This title is temporarily hidden because its link failed our last two checks. It comes back automatically once it works again.</p>' : player(t)}
    <p class="lede">${esc(t.description)}</p>
    <div id="acct-actions"></div>
    ${reportPanel(t)}
    <div id="viewer" class="viewer" hidden></div>`;
  const wf = $('#watch-frame');
  if (wf) wf.addEventListener('click', () => openViewer(t));
  if (location.hash === '#watch' && wf) openViewer(t);
  wireReport(t);
  $('#share-btn').addEventListener('click', async () => {
    const url = `https://reelfree.net/title/${encodeURIComponent(t.id)}`; const msg = $('#share-msg');
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title: `${t.title} on ReelFree`, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); msg.textContent = 'Link copied.'; }
    catch { msg.innerHTML = `Copy this link: <input value="${esc(url)}" readonly onclick="this.select()">`; }
  });
  window.__rfTitleEarly = t;
  window.dispatchEvent(new CustomEvent('reelfree:title', { detail: t }));
}

function openViewer(t) {
  const v = $('#viewer');
  v.innerHTML = `<div class="viewer-bar"><strong>${esc(t.title)}</strong> <span class="muted small">on ${esc(SOURCES[t.source].label)}</span>
    <span class="spacer"></span><a class="btn small ghost" href="${esc(t.url)}" target="_blank" rel="noopener">Open on ${esc(SOURCES[t.source].label)} ↗</a>
    <button class="btn small" id="viewer-close">Back to ReelFree</button></div>
    <iframe src="${esc(t.url)}" title="${esc(t.title)} on ${esc(SOURCES[t.source].label)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  v.hidden = false; document.body.classList.add('viewing');
  if (page === 'title') history.replaceState(null, '', '#watch');
  $('#viewer-close').addEventListener('click', () => { v.hidden = true; v.innerHTML = ''; document.body.classList.remove('viewing'); if (page === 'title') history.replaceState(null, '', location.pathname); });
}

function wireReport(t) {
  const f = $('#report-form'); if (!f) return;
  const opened = Date.now();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#report-msg'); const btn = f.querySelector('button');
    const key = `rf-report-${t.id}`;
    if (localStorage.getItem(key) && Date.now() - +localStorage.getItem(key) < 6 * 3600e3) { msg.textContent = 'Thanks, you already reported this title recently.'; return; }
    btn.disabled = true; msg.textContent = 'Sending…';
    try {
      const r = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id, reason: f.reason.value, note: f.note.value, website: f.website.value, elapsed: Date.now() - opened, page: location.pathname }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { msg.textContent = 'Thanks! Your report was sent.'; localStorage.setItem(key, Date.now()); f.reset(); }
      else msg.textContent = j.error || 'Sorry, the report could not be sent. Please try again later.';
    } catch { msg.textContent = 'Network error. Please try again.'; }
    btn.disabled = false;
  });
}

const page = document.body.dataset.page;
if (page === 'home') home();
if (page === 'title') titlePage();
if (CFG.accountsEnabled && CFG.firebase) import('/accounts.js?v=20261124e').then((m) => m.init(CFG, { loadData, card, extCard, esc, page, getJSON, PLAYBACK, TITLES: () => window.__rfTitles }));
else if (page === 'account') $('#account-root').innerHTML = '<h1>My lists</h1><p class="muted">Accounts are coming soon. Favorites and private lists will appear here.</p>';

// Optional TMDB enrichment: only active when the server has TMDB env vars.
fetch('/api/art').then((r) => r.ok ? r.json() : null).then((j) => {
  if (!j || !j.active) return;
  const f = document.querySelector('.foot');
  if (f) f.insertAdjacentHTML('beforeend', '<p class="small">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>');
  window.__rfTMDB = j.art || {};
  const t = window.__rfTitleEarly, a = t && window.__rfTMDB[t.id];
  if (a && a.releaseDate) { const m = document.querySelector('.title-page .meta'); if (m) m.insertAdjacentHTML('beforeend', ` · Released ${esc(a.releaseDate)}`); }
  document.querySelectorAll('.card.noimg').forEach((c) => { const id = c.getAttribute('href').split('/').pop(); const p = window.__rfTMDB[id]?.poster; if (p) { c.classList.remove('noimg'); c.querySelector('.art').insertAdjacentHTML('afterbegin', `<img src="${esc(p)}" alt="" loading="lazy">`); } });
}).catch(() => {});

// Light/dark theme toggle (default dark), saved in localStorage. The <head> sets it early to avoid a flash.
const tb = $('#theme-btn');
if (tb) {
  const sync = () => { const l = document.documentElement.dataset.theme === 'light'; tb.textContent = l ? '☾ Dark' : '☀ Light'; tb.setAttribute('aria-pressed', String(l)); };
  sync();
  tb.addEventListener('click', () => {
    const l = document.documentElement.dataset.theme !== 'light';
    if (l) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
    localStorage.setItem('rf-theme', l ? 'light' : 'dark'); sync();
  });
}

// ---------- Seasonal themes ----------
// Auto picks by date; visitors can override (localStorage; signed-in users also sync to Firestore prefs).
const SEASONS = {
  halloween: { label: 'Halloween / Scary', banner: '🎃 Scary season: free horror & thrillers', accent: '#ff7a1a', accent2: '#b06cff', match: (t) => /horror|thriller/i.test(t.genre) || /halloween|haunt|ghost|zombie|vampire|witch/i.test(`${t.title} ${t.description}`) },
  thanksgiving: { label: 'Thanksgiving', banner: '🦃 Thanksgiving: free family movies & feel-good picks', accent: '#c8641e', accent2: '#e8b04b', match: (t) => /family|comedy|animation/i.test(t.genre) || /thanksgiving|family|home/i.test(t.title) },
  christmas: { label: 'Christmas', banner: '🎄 Christmas: free holiday movies', accent: '#d42a2a', accent2: '#2fa35a', match: (t) => /christmas|holiday|santa|xmas|noel|snow/i.test(`${t.title} ${t.description}`) },
  newyear: { label: 'New Year', banner: '🎆 New Year: free crowd-pleasers to ring it in', accent: '#d4af37', accent2: '#7aa7ff', match: (t) => /new year|party|celebrat/i.test(`${t.title} ${t.description}`) || /comedy|music/i.test(t.genre) },
  valentines: { label: "Valentine's", banner: "💘 Valentine's: free romance", accent: '#e0457b', accent2: '#ff9ab8', match: (t) => /romance/i.test(t.genre) || /love|romance|valentine/i.test(`${t.title} ${t.description}`) },
  july4: { label: 'July 4', banner: '🎇 July 4: free American classics, history & action', accent: '#2b5bd7', accent2: '#e23b3b', match: (t) => /history|war|western/i.test(t.genre) || /america|independence|president|liberty/i.test(`${t.title} ${t.description}`) },
  none: { label: 'None' },
};
function autoSeason(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 10) return 'halloween';
  if (m === 11) return 'thanksgiving';
  if (m === 12 && day <= 26) return 'christmas';
  if ((m === 12 && day > 26) || (m === 1 && day <= 6)) return 'newyear';
  if (m === 2 && day <= 15) return 'valentines';
  if ((m === 6 && day >= 25) || (m === 7 && day <= 5)) return 'july4';
  return 'none';
}
let SEASON_TITLES = null;
function applySeason(choice) {
  const key = choice && choice !== 'auto' ? choice : autoSeason();
  const S = SEASONS[key] || SEASONS.none; const root = document.documentElement;
  if (S.accent) { root.style.setProperty('--accent', S.accent); root.style.setProperty('--accent2', S.accent2); } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent2'); }
  const ban = $('#season-banner'); const sec = $('#season-row');
  if (ban) { ban.hidden = !S.banner; ban.textContent = S.banner || ''; }
  if (sec && SEASON_TITLES) {
    const list = S.match ? SEASON_TITLES.filter(S.match).sort((a, b) => (b.releaseDate || `${b.year}`).localeCompare(a.releaseDate || `${a.year}`)) : [];
    sec.innerHTML = list.length ? row('holiday', S.label === 'None' ? '' : `${S.label} picks`, list.slice(0, 100), 'Free now, newest first') : '';
  }
  const sel = $('#season-pick'); if (sel) sel.value = choice || 'auto';
}
window.__rfSeason = (c) => { localStorage.setItem('rf-season', c); applySeason(c); };
window.addEventListener('reelfree:home', (e) => { SEASON_TITLES = e.detail.visible; applySeason(localStorage.getItem('rf-season') || 'auto'); });
const sp = $('#season-pick');
if (sp) {
  sp.innerHTML = `<option value="auto">Auto (by date)</option>` + Object.entries(SEASONS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  sp.addEventListener('change', () => { window.__rfSeason(sp.value); window.dispatchEvent(new CustomEvent('reelfree:season', { detail: sp.value })); });
  if (page !== 'home') applySeason(localStorage.getItem('rf-season') || 'auto');
}
