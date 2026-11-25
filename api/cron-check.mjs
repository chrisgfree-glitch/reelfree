// Vercel Cron (daily, US region): run the link checker and commit data/status.json to GitHub.
// Status-only commits don't trigger a redeploy (vercel.json ignoreCommand); the site reads the live file.
import { runChecks } from '../lib/checker.mjs';
import { gh, readJSON, authorized, REPO } from '../lib/gh.mjs';
import { buildQueue } from '../lib/notify.mjs';
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.GH_REPORT_TOKEN) return res.status(503).json({ error: 'GH_REPORT_TOKEN not set' });
  const { data: titles } = await readJSON('data/titles.json');
  const { data: prev, sha } = await readJSON('data/status.json');
  const out = await runChecks(titles, prev);
  await gh(`/repos/${REPO}/contents/data/status.json`, { method: 'PUT', body: JSON.stringify({
    message: `Link check ${out.status.updated.slice(0, 10)}: ${out.failing.length} failing, ${out.hidden.length} hidden`,
    content: Buffer.from(JSON.stringify(out.status, null, 2) + '\n').toString('base64'), sha, branch: 'main',
    committer: { name: 'reelfree-bot', email: 'reelfree-bot@users.noreply.github.com' } }) });
  // Titles that weren't in the previous status file are new since the last run.
  const known = new Set(Object.keys((prev && prev.titles) || {}));
  const fresh = known.size ? titles.filter((t) => !known.has(t.id) && !(out.status.titles[t.id] || {}).hidden) : [];
  const notify = await buildQueue(fresh);
  console.log(out.summary, JSON.stringify(notify));
  return res.status(200).json({ ok: true, summary: out.summary, notify });
}
