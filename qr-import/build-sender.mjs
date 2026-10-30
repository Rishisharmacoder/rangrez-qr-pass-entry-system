// Usage:  node build-sender.mjs --volunteers=10
// Builds ./site  (pass page + one sender page per volunteer) and volunteers.txt.
// Needs tokens.csv from import.mjs, and `npm install` done.

import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const N = Number((process.argv.find((a) => a.startsWith('--volunteers=')) || '--volunteers=10').split('=')[1]);
const E = process.env;

const tokens = parse(fs.readFileSync('tokens.csv'), { columns: true, skip_empty_lines: true });
const sb = createClient(E.SUPABASE_URL, E.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from('students').select('uid,name,mobile').limit(5000);
if (error) throw error;
const by = new Map(rows.map((r) => [r.uid, r]));

const list = tokens
  .filter((t) => by.has(t.uid)) // skip students deleted from Supabase (e.g. test student)
  .map((t) => { const s = by.get(t.uid) || {}; return { uid: t.uid, name: s.name || t.name, mobile: s.mobile || t.mobile || '', token: t.token }; })
  .sort((a, b) => a.name.localeCompare(b.name));

const size = Math.ceil(list.length / N);
const parts = Array.from({ length: N }, (_, i) => list.slice(i * size, (i + 1) * size)).filter((p) => p.length);

fs.rmSync('site', { recursive: true, force: true });
fs.mkdirSync('site');
fs.copyFileSync('pass.html', 'site/index.html');
fs.writeFileSync('site/robots.txt', 'User-agent: *\nDisallow: /\n');
fs.writeFileSync('site/_headers', '/*\n  X-Robots-Tag: noindex\n  Referrer-Policy: no-referrer\n');

const tpl = fs.readFileSync('sender-template.html', 'utf8');
const lines = [];
parts.forEach((part, i) => {
  const id = crypto.randomBytes(6).toString('hex');
  const data = JSON.stringify({ id, n: i + 1, total: parts.length, students: part }).replace(/</g, '\\u003c');
  fs.writeFileSync(`site/v-${id}.html`, tpl.replace('/*DATA*/null', () => data));
  lines.push(`Volunteer ${i + 1} (${part.length} students, ${part[0].name} to ${part.at(-1).name}): <SITE-LINK>/v-${id}.html`);
});
fs.writeFileSync('volunteers.txt', lines.join('\n') + '\n');

console.log(`${list.length} students split across ${parts.length} volunteers.`);
console.log('Created: ./site (upload this folder to Netlify) and ./volunteers.txt');
console.log('Replace <SITE-LINK> in volunteers.txt with your Netlify link, then send each volunteer only their own line.');
