// Optional accounts (behind REELFREE_CONFIG.accountsEnabled). Firebase Auth (email/password) + Firestore.
// Data is private per user: users/{uid}/favorites/{titleId}, users/{uid}/lists/{listId}. See firestore.rules.
const V = '10.14.1';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

let auth, db, user = null, H, HOME = null, SUBS = null;
const LOGGED = new Set();
const $ = (s, el = document) => el.querySelector(s);

export async function init(cfg, helpers) {
  H = helpers;
  const app = initializeApp(cfg.firebase);
  auth = A.getAuth(app); db = F.getFirestore(app);
  const btn = $('#auth-btn'); const link = $('.acct-link');
  btn.hidden = false; link.hidden = false;
  btn.addEventListener('click', async () => { if (user) { await A.signOut(auth); } else location.href = '/account'; });
  A.getRedirectResult(auth).catch(() => {});
  A.onAuthStateChanged(auth, async (u) => {
    user = u; btn.textContent = u ? 'Sign out' : 'Sign in';
    SUBS = null; await syncNotify();
    if (H.page === 'home' && HOME) renderPersonal();
    if (H.page === 'account') renderAccount();
    if (H.page === 'title' && window.__rfTitle) renderTitleActions(window.__rfTitle);
  });
  window.addEventListener('reelfree:title', (e) => { window.__rfTitle = e.detail; renderTitleActions(e.detail); });
  window.addEventListener('reelfree:home', (e) => { HOME = e.detail; renderPersonal(); });
  window.addEventListener('reelfree:rendered', () => syncNotify());
  document.addEventListener('click', onNotifyClick);
  // Genre-browser / request cards open outside the site: log them to history for recommendations.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-tmdb]'); if (!a || !user) return;
    logHistory(`tmdb-${a.dataset.tmdb}`, (a.dataset.genres || '').split('|').filter(Boolean));
  });
  if (window.__rfTitleEarly) renderTitleActions(window.__rfTitleEarly);
}

const favRef = (id) => F.doc(db, 'users', user.uid, 'favorites', id);
const listsCol = () => F.collection(db, 'users', user.uid, 'lists');

async function getLists() {
  const s = await F.getDocs(F.query(listsCol(), F.orderBy('createdAt', 'asc')));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function renderTitleActions(t) {
  const box = $('#acct-actions'); if (!box) return;
  if (user && !LOGGED.has(t.id)) { LOGGED.add(t.id); logHistory(t.id, [t.genre]); trackProgress(t); }
  if (!user) { box.innerHTML = `<p class="small muted"><a href="/account">Sign in</a> to save favorites and make private lists.</p>`; return; }
  const fav = (await F.getDoc(favRef(t.id))).exists();
  const lists = await getLists();
  box.innerHTML = `<div class="actions">
    <button class="btn ${fav ? 'primary' : 'ghost'}" id="fav-btn">${fav ? '★ Favorited' : '☆ Add to favorites'}</button>
    <select id="list-pick" aria-label="Add to list"><option value="">Add to list…</option>
      ${lists.map((l) => `<option value="${H.esc(l.id)}">${(l.items || []).includes(t.id) ? '✓ ' : ''}${H.esc(l.name)}</option>`).join('')}
      <option value="__new">+ New list…</option></select></div><p class="small muted" id="acct-msg"></p>`;
  $('#fav-btn').onclick = async () => {
    if (fav) await F.deleteDoc(favRef(t.id)); else await F.setDoc(favRef(t.id), { addedAt: F.serverTimestamp() });
    renderTitleActions(t);
  };
  $('#list-pick').onchange = async (e) => {
    let id = e.target.value; if (!id) return;
    if (id === '__new') {
      e.target.value = '';
      $('#acct-msg').innerHTML = '<form id="nl" class="actions"><input name="n" maxlength="60" placeholder="New list name" required><button class="btn small primary">Create &amp; add</button></form>';
      $('#nl').onsubmit = async (ev) => {
        ev.preventDefault(); const name = ev.target.n.value.trim().slice(0, 60); if (!name) return;
        await F.addDoc(listsCol(), { name, items: [t.id], createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() });
        renderTitleActions(t);
      };
      return;
    } else {
      const l = lists.find((x) => x.id === id);
      const has = (l.items || []).includes(t.id);
      await F.updateDoc(F.doc(listsCol(), id), { items: has ? F.arrayRemove(t.id) : F.arrayUnion(t.id), updatedAt: F.serverTimestamp() });
    }
    renderTitleActions(t);
  };
}

async function renderAccount() {
  const root = $('#account-root');
  if (!user) {
    root.innerHTML = `<h1>Sign in</h1><p class="muted">Your favorites and lists are private to your account and sync across devices.</p>
      <form id="auth-form" class="auth">
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" minlength="6" required></label>
        <div class="actions"><button class="btn primary" name="mode" value="in">Sign in</button><button class="btn ghost" name="mode" value="up">Create account</button><button class="btn small ghost" type="button" id="reset">Forgot password</button></div>
        <div class="actions"><button class="btn ghost" type="button" id="google">Continue with Google</button></div>
        <p class="small muted" id="auth-msg" role="status"></p></form>`;
    const f = $('#auth-form'); const msg = $('#auth-msg');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const mode = e.submitter?.value || 'in';
      try {
        if (mode === 'up') await A.createUserWithEmailAndPassword(auth, f.email.value, f.password.value);
        else await A.signInWithEmailAndPassword(auth, f.email.value, f.password.value);
      } catch (err) { msg.textContent = friendly(err); }
    });
    $('#google').onclick = async () => {
      // Full-page redirect (no pop-up windows on this site).
      try { await A.signInWithRedirect(auth, new A.GoogleAuthProvider()); } catch (err) { msg.textContent = friendly(err); }
    };
    $('#reset').onclick = async () => {
      if (!f.email.value) { msg.textContent = 'Enter your email first.'; return; }
      try { await A.sendPasswordResetEmail(auth, f.email.value); msg.textContent = 'Check your email for a reset link.'; } catch (err) { msg.textContent = friendly(err); }
    };
    return;
  }
  const [{ titles }, favSnap, lists] = await Promise.all([H.loadData(), F.getDocs(F.collection(db, 'users', user.uid, 'favorites')), getLists()]);
  const byId = Object.fromEntries(titles.map((t) => [t.id, t]));
  const favs = favSnap.docs.map((d) => byId[d.id]).filter(Boolean);
  root.innerHTML = `<h1>My lists</h1><p class="muted small">Signed in as ${H.esc(user.email)}. Only you can see these.</p>
    <h2>Favorites</h2><div class="grid">${favs.map(H.card).join('') || '<p class="muted">No favorites yet. Tap ☆ on any title.</p>'}</div>
    <h2>Alerts</h2><div id="alerts" class="actions"></div><p class="small muted">We'll email ${H.esc(user.email || '')} when a requested title or genre gets new free titles (email sending is coming soon).</p>
    <h2>Lists</h2><form id="new-list" class="actions"><input name="name" maxlength="60" placeholder="New list name" required><button class="btn primary">Create list</button></form>
    ${lists.map((l) => `<section class="list-block" data-id="${H.esc(l.id)}"><div class="actions"><h3>${H.esc(l.name)}</h3><span class="spacer"></span>
      <button class="btn small ghost" data-act="rename">Rename</button><button class="btn small ghost" data-act="delete">Delete</button></div>
      <div class="grid">${(l.items || []).map((id) => byId[id]).filter(Boolean).map((t) => `<div class="list-item">${H.card(t)}<button class="btn small ghost" data-act="remove" data-tid="${H.esc(t.id)}">Remove</button></div>`).join('') || '<p class="muted small">Empty. Add titles from their pages.</p>'}</div></section>`).join('')}`;
  F.getDocs(F.collection(db, 'users', user.uid, 'notify')).then((s) => {
    $('#alerts').innerHTML = s.docs.map((d) => `<button class="btn small ghost" data-unsub="${H.esc(d.id)}">🔔 ${H.esc(d.data().name)} ✕</button>`).join('') || '<span class="muted small">No alerts yet. Use 🔔 Notify me on a genre or a requested title.</span>';
    $('#alerts').querySelectorAll('[data-unsub]').forEach((b) => b.onclick = async () => { await F.deleteDoc(F.doc(db, 'users', user.uid, 'notify', b.dataset.unsub)); b.remove(); });
  }).catch(() => {});
  $('#new-list').onsubmit = async (e) => { e.preventDefault(); const name = e.target.name.value.trim().slice(0, 60); if (!name) return; await F.addDoc(listsCol(), { name, items: [], createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() }); renderAccount(); };
  root.querySelectorAll('.list-block button').forEach((b) => b.onclick = async () => {
    const lid = b.closest('.list-block').dataset.id; const ref = F.doc(listsCol(), lid);
    if (b.dataset.act === 'delete') { if (b.dataset.armed) await F.deleteDoc(ref); else { b.dataset.armed = 1; b.textContent = 'Tap again to delete'; return; } }
    if (b.dataset.act === 'rename') {
      const h = b.closest('.actions').querySelector('h3');
      h.innerHTML = `<form class="actions"><input name="n" maxlength="60" value="${H.esc(h.textContent)}" required><button class="btn small primary">Save</button></form>`;
      h.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); const n = ev.target.n.value.trim().slice(0, 60); if (n) await F.updateDoc(ref, { name: n, updatedAt: F.serverTimestamp() }); renderAccount(); };
      return;
    }
    if (b.dataset.act === 'remove') await F.updateDoc(ref, { items: F.arrayRemove(b.dataset.tid), updatedAt: F.serverTimestamp() });
    renderAccount();
  });
}

function friendly(err) {
  const c = err?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email or password is incorrect.';
  if (c.includes('email-already-in-use')) return 'An account with that email already exists. Try signing in.';
  if (c.includes('weak-password')) return 'Use at least 6 characters.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Please wait a bit.';
  return 'Something went wrong. Please try again.';
}

// ---------- Watch history -> "Recommended for you" ----------
const GA = { 'Science Fiction': 'Sci-Fi', 'Sci-Fi & Fantasy': 'Sci-Fi', 'Action & Adventure': 'Action' };
const gn = (g) => GA[g] || g;
async function logHistory(key, genres) {
  try {
    const ref = F.doc(db, 'users', user.uid, 'history', String(key).slice(0, 80));
    const old = await F.getDoc(ref);
    await F.setDoc(ref, { lastAt: F.serverTimestamp(), count: (old.exists() ? old.data().count || 0 : 0) + 1, genres: genres.map(gn).slice(0, 10) });
  } catch {}
}
// Score = sum over the candidate's genres of the user's genre weights. Each history item adds
// (1 + log2(times opened)) * 0.5^(days since last opened / 30) to each of its genres.
function recommend(hist, cands) {
  const w = {}; const now = Date.now();
  for (const h of hist) {
    const days = h.lastAt ? (now - h.lastAt.toMillis()) / 864e5 : 0;
    const v = (1 + Math.log2(Math.max(1, h.count || 1))) * Math.pow(0.5, days / 30);
    for (const g of h.genres || []) w[g] = (w[g] || 0) + v;
  }
  const seen = new Set(hist.map((h) => h.id));
  return cands.filter((c) => !seen.has(c.key)).map((c) => ({ c, score: c.genres.reduce((a, g) => a + (w[gn(g)] || 0), 0) }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score || String(b.c.date).localeCompare(String(a.c.date))).slice(0, 20).map((x) => x.c);
}
async function renderPersonal() {
  const box = $('#personal'); if (!box) return;
  if (!user || !HOME) { box.innerHTML = ''; return; }
  const [hs, ps, gj] = await Promise.all([
    F.getDocs(F.query(F.collection(db, 'users', user.uid, 'history'), F.orderBy('lastAt', 'desc'), F.limit(300))).catch(() => null),
    F.getDocs(F.query(F.collection(db, 'users', user.uid, 'progress'), F.orderBy('updatedAt', 'desc'), F.limit(20))).catch(() => null),
    H.getJSON('/data/genres.json', 10000).catch(() => ({ genres: [] }))]);
  const hist = hs ? hs.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
  const byId = Object.fromEntries(HOME.visible.map((t) => [t.id, t]));
  // Continue watching / recently opened
  const cw = (ps ? ps.docs : []).map((d) => ({ t: byId[d.id], ...d.data() })).filter((x) => x.t);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const cwHtml = cw.length ? `<section class="row"><div class="row-head"><h2>Continue watching</h2><span class="muted small">Resume works for YouTube embeds; other sources show as recently opened</span></div><div class="rail">${
    cw.map((x) => H.card(x.t).replace('</a>', `<span class="kind cw">${x.mode === 'tracked' && x.pos > 30 ? `Resume ${fmt(x.pos)}` : 'Recently opened'}</span>${x.mode === 'tracked' && x.dur ? `<span class="progress"><i style="width:${Math.min(100, (100 * x.pos) / x.dur).toFixed(0)}%"></i></span>` : ''}</a>`)).join('')}</div></section>` : '';
  // Candidates: catalog titles + genre-browser titles
  const cands = HOME.visible.map((t) => ({ key: t.id, tmdb: t.tmdbId, genres: [t.genre], date: t.releaseDate || `${t.year}`, html: () => H.card(t) }));
  const inCat = new Set(HOME.visible.filter((t) => t.tmdbId).map((t) => String(t.tmdbId)));
  const ext = {};
  for (const g of gj.genres || []) for (const m of g.items) { if (inCat.has(String(m.tmdbId))) continue; (ext[m.tmdbId] ||= { m, genres: [] }).genres.push(g.name); }
  for (const { m, genres } of Object.values(ext)) cands.push({ key: `tmdb-${m.tmdbId}`, genres, date: m.releaseDate || `${m.year}`, html: () => H.extCard({ ...m, genres }) });
  const watchedTmdb = new Set(hist.map((h) => h.id));
  for (const t of HOME.visible) if (t.tmdbId && watchedTmdb.has(t.id)) watchedTmdb.add(`tmdb-${t.tmdbId}`);
  const recs = recommend(hist.map((h) => ({ ...h, id: h.id })), cands.filter((c) => !(c.tmdb && watchedTmdb.has(`tmdb-${c.tmdb}`))));
  const recHtml = `<section class="row"><div class="row-head"><h2>Recommended for you</h2><span class="muted small">Based on what you've opened</span></div>${
    recs.length ? `<div class="rail">${recs.map((c) => c.html()).join('')}</div>` : '<p class="muted">Watch something to get picks.</p>'}</section>`;
  box.innerHTML = cwHtml + recHtml;
}

// ---------- Continue watching ----------
async function trackProgress(t) {
  const ref = F.doc(db, 'users', user.uid, 'progress', t.id);
  const mode = H.PLAYBACK[t.source];
  if (t.source !== 'youtube') { // can't read playback position from other players / sites
    if (mode !== 'inline') F.setDoc(ref, { pos: 0, dur: 0, mode: 'opened', updatedAt: F.serverTimestamp() }).catch(() => {});
    else F.setDoc(ref, { pos: 0, dur: 0, mode: 'opened', updatedAt: F.serverTimestamp() }).catch(() => {});
    return;
  }
  const prev = await F.getDoc(ref).catch(() => null);
  const saved = prev && prev.exists() ? prev.data() : null;
  if (!window.YT || !window.YT.Player) await new Promise((ok) => { window.onYouTubeIframeAPIReady = ok; const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc); });
  const p = new window.YT.Player('yt-player', { events: { onReady: () => {
    if (saved && saved.mode === 'tracked' && saved.pos > 30) {
      const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = `▶ Resume at ${Math.floor(saved.pos / 60)}:${String(Math.floor(saved.pos % 60)).padStart(2, '0')}`;
      b.onclick = () => { p.seekTo(saved.pos, true); p.playVideo(); b.remove(); };
      document.querySelector('.share-row')?.prepend(b);
    }
    setInterval(() => {
      if (p.getPlayerState?.() !== 1) return;
      F.setDoc(ref, { pos: Math.floor(p.getCurrentTime()), dur: Math.floor(p.getDuration() || 0), mode: 'tracked', updatedAt: F.serverTimestamp() }).catch(() => {});
    }, 15000);
  } } });
}

// ---------- Notify me ----------
const nkey = (b) => b.dataset.type === 'genre' ? `genre-${b.dataset.genreId}` : `title-${b.dataset.tmdbId}`;
async function syncNotify() {
  const btns = document.querySelectorAll('[data-notify]');
  if (!btns.length) return;
  if (user && !SUBS) { try { SUBS = new Set((await F.getDocs(F.collection(db, 'users', user.uid, 'notify'))).docs.map((d) => d.id)); } catch { SUBS = new Set(); } }
  btns.forEach((b) => { const on = user && SUBS && SUBS.has(nkey(b)); b.classList.toggle('primary', !!on); if (on) b.textContent = `🔔 Notifying you: ${b.dataset.name} (tap to stop)`; });
}
async function onNotifyClick(e) {
  const b = e.target.closest('[data-notify]'); if (!b) return;
  if (!user) { location.href = '/account'; return; }
  if (!user.email) { b.textContent = 'Your account needs an email address for alerts.'; return; }
  const key = nkey(b); const ref = F.doc(db, 'users', user.uid, 'notify', key);
  try {
    if (SUBS && SUBS.has(key)) { await F.deleteDoc(ref); SUBS.delete(key); b.classList.remove('primary'); b.textContent = `🔔 Notify me: ${b.dataset.name}`; return; }
    const d = { type: b.dataset.type, name: String(b.dataset.name).slice(0, 120), email: user.email, createdAt: F.serverTimestamp() };
    if (b.dataset.tmdbId) d.tmdbId = Number(b.dataset.tmdbId); if (b.dataset.genreId) d.genreId = Number(b.dataset.genreId);
    await F.setDoc(ref, d); (SUBS ||= new Set()).add(key); syncNotify();
  } catch { b.textContent = 'Could not save. Try again.'; }
}
