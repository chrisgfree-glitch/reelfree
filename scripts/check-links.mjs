#!/usr/bin/env node
// ReelFree link checker CLI. Usage: node scripts/check-links.mjs [--only id1,id2] [--no-write]
import fs from 'node:fs';
import { runChecks } from '../lib/checker.mjs';
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const titles = JSON.parse(fs.readFileSync('data/titles.json', 'utf8'));
const status = fs.existsSync('data/status.json') ? JSON.parse(fs.readFileSync('data/status.json', 'utf8')) : null;
const out = await runChecks(titles, status, { only });
console.log(out.summary);
if (!args.includes('--no-write')) fs.writeFileSync('data/status.json', JSON.stringify(out.status, null, 2) + '\n');
