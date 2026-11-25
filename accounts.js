// Optional accounts (behind REELFREE_CONFIG.accountsEnabled). Firebase Auth (email/password) + Firestore.
// Data is private per user: users/{uid}/favorites/{titleId}, users/{uid}/lists/{listId}. See firestore.rules.
const V = '10.14.1';
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

let auth, db, user = null, H;
const $ = (s, el = document) => el.querySelector(s);

export async function init(cfg, helpers) {
  H = helpers;
  const app = initializeApp(cfg.firebase);
  auth = A.getAuth(app); db = F.getFirestore(app);
  const btn = $('#auth-btn'); const link = $('.acct-link');
  btn.hidden = false; link.hidden = false;
  btn.addEventListener('click', async () => { if (user) { await A.signOut(auth); } else location.href = '/account'; });
  A.onAuthStateChanged(auth, (u) => {
    user = u; btn.textContent = u ? 'Sign out' : 'Sign in';
    if (H.page === 'account') renderAccount();
    if (H.page === 'title' && window.__rfTitle) renderTitleActions(window.__rfTitle);
  });
  window.addEventListener('reelfree:title', (e) => { window.__rfTitle = e.detail; renderTitleActions(e.detail); });
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
        <p class="small muted" id="auth-msg" role="status"></p></form>`;
    const f = $('#auth-form'); const msg = $('#auth-msg');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const mode = e.submitter?.value || 'in';
      try {
        if (mode === 'up') await A.createUserWithEmailAndPassword(auth, f.email.value, f.password.value);
        else await A.signInWithEmailAndPassword(auth, f.email.value, f.password.value);
      } catch (err) { msg.textContent = friendly(err); }
    });
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
    <h2>Lists</h2><form id="new-list" class="actions"><input name="name" maxlength="60" placeholder="New list name" required><button class="btn primary">Create list</button></form>
    ${lists.map((l) => `<section class="list-block" data-id="${H.esc(l.id)}"><div class="actions"><h3>${H.esc(l.name)}</h3><span class="spacer"></span>
      <button class="btn small ghost" data-act="rename">Rename</button><button class="btn small ghost" data-act="delete">Delete</button></div>
      <div class="grid">${(l.items || []).map((id) => byId[id]).filter(Boolean).map((t) => `<div class="list-item">${H.card(t)}<button class="btn small ghost" data-act="remove" data-tid="${H.esc(t.id)}">Remove</button></div>`).join('') || '<p class="muted small">Empty. Add titles from their pages.</p>'}</div></section>`).join('')}`;
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
