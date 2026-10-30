// Usage:
//   node import.mjs "Dandiya_Night_2026_Student_Registration_Form__Responses_.xlsx" --dry
//   node import.mjs "Dandiya_Night_2026_Student_Registration_Form__Responses_.xlsx"
//   node import.mjs offline_students.xlsx --source=offline      (later, for extra students)
//
// Safe to re-run: students are upserted by UID, and students who already
// have a ticket are skipped (their QR is NOT regenerated).

import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
const source = (args.find((a) => a.startsWith('--source=')) || '--source=online').split('=')[1];

if (!file) {
  console.error('Usage: node import.mjs <sheet.xlsx> [--dry] [--source=online|offline]');
  process.exit(1);
}

// ---------- helpers ----------
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// "92638 12972 " -> "919263812972" ; anything not 10 digits -> null
function phone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length > 10) d = d.slice(-10);
  return d.length === 10 ? '91' + d : null;
}

const csvq = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// ---------- 1. read + clean sheet ----------
const wb = XLSX.readFile(file);
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

const byUid = new Map();
const problems = [];

raw.forEach((row, i) => {
  // header names in the sheet have trailing spaces ("Semester ", "Hostel ") -> trim them
  const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v]));
  const s = {
    uid: clean(r['UID']),
    name: clean(r['Full Name']),
    email: clean(r['Email Address']).toLowerCase(),
    mobile: phone(r['Mobile Number']),
    course: clean(r['Course/Branch']),
    semester: clean(r['Semester']),
    hostel: clean(r['Hostel']),
    room: clean(r['Room No.']),
  };
  const line = i + 2; // sheet row number (row 1 = header)
  if (!s.uid || !s.name) return problems.push(`Row ${line}: missing UID or name, skipped`);
  if (byUid.has(s.uid)) return problems.push(`Row ${line}: duplicate UID ${s.uid} (${s.name}), skipped`);
  if (!s.mobile) problems.push(`Row ${line}: ${s.name} has invalid mobile "${r['Mobile Number']}" (imported, but WhatsApp will fail)`);
  byUid.set(s.uid, { ...s, source });
});

const students = [...byUid.values()];
console.log(`Sheet rows: ${raw.length} | Unique students: ${students.length}`);
problems.forEach((p) => console.log('  !', p));

if (dry) {
  console.log('\nDry run only. Nothing was written.');
  process.exit(0);
}

// ---------- 2. upsert students ----------
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const idByUid = new Map();
for (let i = 0; i < students.length; i += 200) {
  const { data, error } = await sb
    .from('students')
    .upsert(students.slice(i, i + 200), { onConflict: 'uid' })
    .select('id,uid');
  if (error) throw error;
  data.forEach((d) => idByUid.set(d.uid, d.id));
}
console.log(`Students saved: ${idByUid.size}`);

// ---------- 3. tickets only for students who don't have one ----------
const { data: existing, error: e2 } = await sb.from('tickets').select('student_id').limit(5000);
if (e2) throw e2;
const have = new Set(existing.map((t) => t.student_id));

const newTickets = [];
const made = []; // { s, token }
for (const s of students) {
  const id = idByUid.get(s.uid);
  if (have.has(id)) continue;
  const token = 'DN26.' + crypto.randomBytes(12).toString('base64url');
  // must match SQL: encode(digest(convert_to(token,'utf8'),'sha256'),'hex')
  const token_hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  newTickets.push({ student_id: id, token_hash });
  made.push({ s, token });
}

for (let i = 0; i < newTickets.length; i += 200) {
  const { error } = await sb.from('tickets').insert(newTickets.slice(i, i + 200));
  if (error) throw error;
}
console.log(`New tickets created: ${newTickets.length} (already had ticket: ${students.length - newTickets.length})`);

// ---------- 4. QR images + token list (only after DB insert succeeded) ----------
fs.mkdirSync('qr', { recursive: true });
const tokensFile = 'tokens.csv';
if (!fs.existsSync(tokensFile)) fs.writeFileSync(tokensFile, 'uid,name,mobile,token,qr_file\n');

for (const { s, token } of made) {
  const qrFile = `qr/${s.uid}.png`;
  await QRCode.toFile(qrFile, token, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
  fs.appendFileSync(tokensFile, [s.uid, s.name, s.mobile ?? '', token, qrFile].map(csvq).join(',') + '\n');
}

console.log(`\nDone. ${made.length} QR images in ./qr  |  token list: ./${tokensFile}`);
console.log('Keep tokens.csv safe (only the hash is in the database; tokens cannot be recovered).');
