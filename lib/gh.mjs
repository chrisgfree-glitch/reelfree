// Minimal GitHub REST helper for the Vercel cron functions. Token comes from the GH_REPORT_TOKEN env var.
export const REPO = process.env.GH_REPO || 'chrisgfree-glitch/reelfree';
export async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com${path}`, { ...opts, headers: { Authorization: `Bearer ${process.env.GH_REPORT_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'reelfree-cron', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`);
  return j;
}
export async function readJSON(path) {
  const f = await gh(`/repos/${REPO}/contents/${path}?ref=main`);
  return { data: JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')), sha: f.sha };
}
export function authorized(req) {
  const want = process.env.CRON_SECRET;
  return !!want && req.headers.authorization === `Bearer ${want}`;
}
