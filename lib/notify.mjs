// "Notify me" queue. Runs inside the nightly cron.
// Reading every user's users/{uid}/notify docs needs server credentials, so this only runs when
// FIREBASE_SERVICE_ACCOUNT (the service-account JSON, stored as a Vercel env var) is set. Otherwise it skips.
// Queue docs go to Firestore notifyQueue/{uid}_{titleId} (clients can't read it: rules deny everything outside users/{uid}).
// Sending is OFF: sendEmail() only sends when NOTIFY_SEND_ENABLED === 'true' AND RESEND_API_KEY is set.
import { createSign } from 'node:crypto';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'reelfree-net';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SITE = 'https://reelfree.net';
const GENRE_ALIAS = { 'Science Fiction': 'Sci-Fi', 'Sci-Fi & Fantasy': 'Sci-Fi', 'Action & Adventure': 'Action' };
const gname = (g) => GENRE_ALIAS[g] || g;

async function accessToken() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}
const val = (f) => f && (f.stringValue ?? f.integerValue ?? f.doubleValue ?? null);

/** Interface for sending one notification email. Disabled unless explicitly turned on. */
export async function sendEmail({ to, subject, text }) {
  if (process.env.NOTIFY_SEND_ENABLED !== 'true' || !process.env.RESEND_API_KEY) return { sent: false, reason: 'sending disabled' };
  const r = await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'ReelFree <notify@reelfree.net>', to, subject, text }) });
  return { sent: r.ok, status: r.status };
}

/** newTitles: catalog titles added since the last run. Returns a summary; never throws into the cron. */
export async function buildQueue(newTitles) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return { skipped: 'FIREBASE_SERVICE_ACCOUNT not set' };
  if (!newTitles.length) return { queued: 0, newTitles: 0 };
  try {
    const tok = await accessToken();
    const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
    const q = await fetch(`${FS}:runQuery`, { method: 'POST', headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'notify', allDescendants: true }], limit: 5000 } }) });
    const rows = (await q.json()).filter((x) => x.document).map((x) => {
      const f = x.document.fields || {}; const uid = x.document.name.split('/users/')[1].split('/')[0];
      return { uid, type: val(f.type), tmdbId: Number(val(f.tmdbId)) || null, name: val(f.name), email: val(f.email) };
    });
    let queued = 0, sent = 0;
    for (const s of rows) for (const t of newTitles) {
      const hit = s.type === 'title' ? s.tmdbId && Number(t.tmdbId) === s.tmdbId : s.type === 'genre' && gname(s.name) === gname(t.genre);
      if (!hit || !s.email) continue;
      const docId = `${s.uid}_${t.id}`.slice(0, 140);
      const body = { fields: { email: { stringValue: s.email }, titleId: { stringValue: t.id }, title: { stringValue: t.title },
        url: { stringValue: `${SITE}/title/${t.id}` }, reason: { stringValue: s.type === 'title' ? 'requested title' : `new in ${s.name}` },
        status: { stringValue: 'queued' }, createdAt: { timestampValue: new Date().toISOString() } } };
      const r = await fetch(`${FS}/notifyQueue?documentId=${encodeURIComponent(docId)}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
      if (r.status === 409) continue; // already queued
      if (r.ok) {
        queued++;
        const m = await sendEmail({ to: s.email, subject: `Now free on ReelFree: ${t.title}`, text: `${t.title} (${t.year}) is now on ReelFree: ${SITE}/title/${t.id}\n\nYou asked to be notified (${s.type === 'title' ? 'requested title' : `new ${s.name} titles`}). Manage alerts at ${SITE}/account.` });
        if (m.sent) { sent++; await fetch(`${FS}/notifyQueue/${encodeURIComponent(docId)}?updateMask.fieldPaths=status`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { status: { stringValue: 'sent' } } }) }); }
      }
    }
    return { subscriptions: rows.length, newTitles: newTitles.length, queued, sent };
  } catch (e) { return { error: String(e.message || e) }; }
}
