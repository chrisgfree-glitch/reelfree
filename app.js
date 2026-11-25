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
};
// How each source plays, based on observed response headers (see README "Playback").
// inline: official embed player; frame: full source page in an in-site viewer; tab: new tab (framing blocked).
const PLAYBACK = { archive: 'inline', youtube: 'inline', commons: 'inline', pluto: 'frame', tubi: 'tab', loc: 'tab', plex: 'tab' };

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
function card(t) {
  const img = IMG[t.id] || t.image;
  return `<a class="card${img ? '' : ' noimg'}" href="/title/${esc(t.id)}">
    <span class="art">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.parentNode.classList.add('noimg');this.remove()">` : ''}<img class="fallback" src="/icons/logo-128.png" alt="" aria-hidden="true"></span>
    <span class="scrim"></span>
    <span class="badge src-${t.source}">${esc(SOURCES[t.source].short)}</span>
    <span class="kind">${t.type === 'tv' ? 'TV' : 'Movie'}</span>
    <span class="info"><h3>${esc(t.title)}</h3><span class="meta">${esc(t.year)} · ${esc(t.genre)}</span></span>
  </a>`;
}

const row = (id, title, list, note = '') => `<section class="row" id="${id}"><div class="row-head"><h2>${title}</h2>${note ? `<span class="muted small">${note}</span>` : ''}</div>
  <div class="rail">${list.map(card).join('')}</div></section>`;

async function home() {
  const { titles, isHidden, status } = await loadData();
  IMG = Object.fromEntries(Object.entries(status.titles || {}).filter(([, v]) => v.image).map(([k, v]) => [k, v.image]));
  const visible = titles.filter((t) => !isHidden(t.id));
  const byYear = (a, b) => b.year - a.year || a.title.localeCompare(b.title);
  $('#sections').innerHTML =
    row('newest', 'Top 25 newest', [...visible].sort(byYear).slice(0, 25)) +
    row('popular', 'Popular movies', visible.filter((t) => t.type === 'movie' && t.popularRank).sort((a, b) => a.popularRank - b.popularRank), 'Staff picks') +
    row('tv', 'TV shows', visible.filter((t) => t.type === 'tv').sort(byYear), 'Newest first');
  const genres = [...new Set(visible.map((t) => t.genre))].sort();
  $('#genre').insertAdjacentHTML('beforeend', genres.map((g) => `<option>${esc(g)}</option>`).join(''));
  const p = new URLSearchParams(location.search);
  const st = { q: p.get('q') || '', genre: p.get('genre') || '', source: p.get('source') || '', type: p.get('type') || '' };
  $('#q').value = st.q; $('#genre').value = st.genre; $('#source').value = st.source;
  const render = () => {
    const q = st.q.trim().toLowerCase();
    const filtering = !!(q || st.genre || st.source || st.type);
    const list = visible.filter((t) => (!st.genre || t.genre === st.genre) && (!st.source || t.source === st.source)
      && (!st.type || t.type === st.type)
      && (!q || `${t.title} ${t.genre} ${t.description} ${t.year}`.toLowerCase().includes(q)))
      .sort((a, b) => a.title.replace(/^(the|a|an) /i, '').localeCompare(b.title.replace(/^(the|a|an) /i, '')));
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
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { st.type = b.dataset.type; render(); }));
  render();
}

function player(t) {
  const mode = PLAYBACK[t.source];
  const src = SOURCES[t.source].label;
  const out = `<a class="btn ghost" href="${esc(t.url)}" target="_blank" rel="noopener">Open on ${esc(src)} ↗</a>`;
  if (mode === 'inline') {
    const allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    return `<div class="player"><iframe src="${esc(t.embedUrl)}" title="${esc(t.title)} (${esc(src)} player)" allow="${allow}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe></div>
      <div class="actions">${out}</div>`;
  }
  if (mode === 'frame') {
    return `<div class="actions"><button class="btn primary" id="watch-frame">▶ Watch free on ${esc(src)}</button>${out}</div>
      <p class="muted small">Plays inside ReelFree in ${esc(src)}'s own page, with their ads. If it doesn't load, use “Open on ${esc(src)}”.</p>`;
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
  const root = $('#title-root');
  if (!t) { root.innerHTML = '<h1>Title not found</h1><p><a href="/">Back to browse</a></p>'; return; }
  document.title = `${t.title} (${t.year}) · Watch free on ReelFree`;
  const hidden = isHidden(t.id);
  root.innerHTML = `
    <p class="crumbs"><a href="/">← All titles</a></p>
    <h1>${esc(t.title)} <span class="year">${esc(t.year)}</span></h1>
    <p class="meta"><span class="badge src-${t.source}">${esc(SOURCES[t.source].label)}</span> ${t.type === 'tv' ? 'TV' : 'Movie'} · ${esc(t.genre)}</p>
    ${!hidden && PLAYBACK[t?.source] !== 'inline' && (st.image || t.image) ? `<div class="poster"><img src="${esc(st.image || t.image)}" alt="${esc(t.title)} artwork from ${esc(SOURCES[t.source].label)}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ''}
    ${hidden ? '<p class="notice">This title is temporarily hidden because its link failed our last two checks. It comes back automatically once it works again.</p>' : player(t)}
    <p class="lede">${esc(t.description)}</p>
    <div id="acct-actions"></div>
    ${reportPanel(t)}
    <div id="viewer" class="viewer" hidden></div>`;
  const wf = $('#watch-frame');
  if (wf) wf.addEventListener('click', () => openViewer(t));
  if (location.hash === '#watch' && wf) openViewer(t);
  wireReport(t);
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
  history.replaceState(null, '', '#watch');
  $('#viewer-close').addEventListener('click', () => { v.hidden = true; v.innerHTML = ''; document.body.classList.remove('viewing'); history.replaceState(null, '', location.pathname); });
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
if (CFG.accountsEnabled && CFG.firebase) import('/accounts.js').then((m) => m.init(CFG, { loadData, card, esc, page }));
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
