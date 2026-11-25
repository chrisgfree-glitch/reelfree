// Vercel Cron (weekly): open or update the single open "weekly-report" GitHub issue.
import { gh, readJSON, authorized, REPO } from '../lib/gh.mjs';
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const { data: titles } = await readJSON('data/titles.json');
  const { data: status } = await readJSON('data/status.json');
  const byId = Object.fromEntries(titles.map((t) => [t.id, t]));
  const rows = Object.entries(status.titles || {}).map(([id, s]) => ({ id, ...s, t: byId[id] })).filter((r) => r.t);
  const hidden = rows.filter((r) => r.hidden), failing = rows.filter((r) => !r.ok && !r.hidden);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const reports = (await gh(`/repos/${REPO}/issues?labels=user-report&state=open&per_page=100`)).filter((i) => !i.pull_request);
  const fmt = (r) => `| ${r.t.title} (${r.t.year}) | ${r.t.source} | ${r.consecutiveFailures} | ${String(r.detail || '').replace(/\|/g, '/')} | [link](${r.t.url}) |`;
  const table = (l) => l.length ? ['| Title | Source | Fails in a row | Last result | Link |', '|---|---|---|---|---|', ...l.map(fmt)].join('\n') : '_None._';
  const today = new Date().toISOString().slice(0, 10);
  const body = `Weekly ReelFree link report, generated ${new Date().toISOString()}.\nLast nightly check: ${status.updated || 'never'} · ${rows.length} titles tracked.\n\n` +
    `## Hidden (failed ${status.hideAfter || 2}+ checks in a row, auto-hidden)\n${table(hidden)}\n\n` +
    `## Failing once (hides if it fails again)\n${table(failing)}\n\n` +
    `## Open visitor reports (${reports.length})\n${reports.length ? reports.map((i) => `- #${i.number} ${i.title}${i.updated_at > since ? ' (new this week)' : ''}`).join('\n') : '_None._'}\n\n` +
    `Titles un-hide automatically when they pass again. Close visitor-report issues once handled.`;
  const open = (await gh(`/repos/${REPO}/issues?labels=weekly-report&state=open&per_page=5`)).filter((i) => !i.pull_request);
  let n;
  if (open[0]) { n = open[0].number; await gh(`/repos/${REPO}/issues/${n}`, { method: 'PATCH', body: JSON.stringify({ title: `Weekly link report (updated ${today})`, body }) }); }
  else { n = (await gh(`/repos/${REPO}/issues`, { method: 'POST', body: JSON.stringify({ title: `Weekly link report (${today})`, body, labels: ['weekly-report'] }) })).number; }
  return res.status(200).json({ ok: true, issue: n, hidden: hidden.length, failing: failing.length, reports: reports.length });
}
