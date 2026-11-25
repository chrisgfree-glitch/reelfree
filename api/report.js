// POST /api/report  -> records a broken-link report as a GitHub issue in the repo (label: user-report).
// Needs Vercel env vars: GH_REPORT_TOKEN (token allowed to create issues on the repo), GH_REPO (owner/name).
// Anti-spam: honeypot field, minimum time on page, per-IP rate limit (per instance), one open issue per title
// (repeat reports become comments, capped), length limits. No IPs or personal data are stored.
const titles = require('../data/titles.json');
const byId = Object.fromEntries(titles.map((t) => [t.id, t]));
const REASONS = { 'wont-play': "Video won't play", removed: 'Title removed / page gone', 'wrong-title': 'Wrong title or video', region: 'Not available in region', rights: 'Rights concern', other: 'Something else' };
const hits = new Map(); // ip -> [timestamps]
const LIMIT = 5, WINDOW = 3600e3, MAX_COMMENTS = 25;

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > LIMIT;
}

async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, { ...opts, headers: { Authorization: `Bearer ${process.env.GH_REPORT_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'reelfree-report', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return j;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST' }); }
  const origin = req.headers.origin || '';
  if (origin && !/^https:\/\/((www\.)?reelfree\.net|reelfree[a-z0-9-]*\.vercel\.app)$/.test(origin)) return res.status(403).json({ error: 'Forbidden' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  // Honeypot or too fast: pretend success so bots learn nothing.
  if (b.website || !(Number(b.elapsed) >= 3000)) return res.status(200).json({ ok: true });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many reports. Please try again later.' });
  const t = byId[String(b.id || '')];
  if (!t) return res.status(400).json({ error: 'Unknown title.' });
  const reason = REASONS[b.reason] ? b.reason : 'other';
  const note = String(b.note || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!process.env.GH_REPORT_TOKEN || !process.env.GH_REPO) return res.status(503).json({ error: 'Reporting is not configured yet.' });
  const repo = process.env.GH_REPO;
  const line = `- ${new Date().toISOString()} · **${REASONS[reason]}**${note ? ` · "${note}"` : ''}`;
  const issueTitle = `[report] ${t.id}: ${t.title}`;
  try {
    const q = encodeURIComponent(`repo:${repo} is:issue is:open label:user-report in:title "[report] ${t.id}:"`);
    const found = await gh(`/search/issues?q=${q}&per_page=5`);
    const existing = (found.items || []).find((i) => i.title.startsWith(`[report] ${t.id}:`));
    if (existing) {
      if (existing.comments < MAX_COMMENTS) await gh(`/repos/${repo}/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Another report:\n${line}` }) });
    } else {
      await gh(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: issueTitle, labels: ['user-report'],
        body: `Visitor report for **${t.title}** (${t.year}) on ${t.source}.\n\n- Link: ${t.url}\n- Title page: https://reelfree.net/title/${t.id}\n\n${line}\n\n_Close this issue once fixed or confirmed fine._` }) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('report failed', e.message);
    return res.status(502).json({ error: 'Sorry, the report could not be sent right now.' });
  }
};
