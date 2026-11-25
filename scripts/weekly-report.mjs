#!/usr/bin/env node
// Opens or updates the single open "weekly-report" issue with hidden/failing titles and recent visitor reports.
import fs from 'node:fs';
const repo = process.env.GITHUB_REPOSITORY; const token = process.env.GITHUB_TOKEN;
const api = async (path, opts = {}) => {
  const r = await fetch(`https://api.github.com${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'reelfree-weekly' } });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
};
const titles = JSON.parse(fs.readFileSync('data/titles.json', 'utf8'));
const status = JSON.parse(fs.readFileSync('data/status.json', 'utf8'));
const byId = Object.fromEntries(titles.map((t) => [t.id, t]));
const rows = Object.entries(status.titles || {}).map(([id, s]) => ({ id, ...s, t: byId[id] })).filter((r) => r.t);
const hidden = rows.filter((r) => r.hidden), failing = rows.filter((r) => !r.ok && !r.hidden);
const since = new Date(Date.now() - 7 * 864e5).toISOString();
const reports = (await api(`/repos/${repo}/issues?labels=user-report&state=open&per_page=100`)).filter((i) => !i.pull_request);
const fmt = (r) => `| ${r.t.title} (${r.t.year}) | ${r.t.source} | ${r.consecutiveFailures} | ${r.detail || ''} | [link](${r.t.url}) |`;
const table = (list) => list.length ? ['| Title | Source | Fails in a row | Last result | Link |', '|---|---|---|---|---|', ...list.map(fmt)].join('\n') : '_None._';
const body = `Weekly ReelFree link report, generated ${new Date().toISOString()}.\nLast nightly check: ${status.updated || 'never'} · ${rows.length} titles tracked.\n\n` +
  `## Hidden (failed ${status.hideAfter || 2}+ checks in a row, auto-hidden from the site)\n${table(hidden)}\n\n` +
  `## Failing once (will hide if it fails again)\n${table(failing)}\n\n` +
  `## Open visitor reports (${reports.length})\n${reports.length ? reports.map((i) => `- #${i.number} ${i.title}${i.updated_at > since ? ' 🆕' : ''}`).join('\n') : '_None._'}\n\n` +
  `Titles un-hide automatically when they pass again. Close visitor-report issues once handled.`;
const open = (await api(`/repos/${repo}/issues?labels=weekly-report&state=open&per_page=5`)).filter((i) => !i.pull_request);
if (open[0]) { await api(`/repos/${repo}/issues/${open[0].number}`, { method: 'PATCH', body: JSON.stringify({ body, title: `Weekly link report (updated ${new Date().toISOString().slice(0, 10)})` }) }); console.log('updated #' + open[0].number); }
else { const i = await api(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: `Weekly link report (${new Date().toISOString().slice(0, 10)})`, body, labels: ['weekly-report'] }) }); console.log('created #' + i.number); }
