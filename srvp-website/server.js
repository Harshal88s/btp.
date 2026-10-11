/*
 * SRVP website server
 * -------------------
 *  - Serves the public website from /public
 *  - Public API  : /api/public/*   (faculty, toppers, announcements, enquiry form)
 *  - Admin API   : /api/admin/*    (login required — students, faculty, enquiries ...)
 *  - Admin panel : /admin
 *
 * Start with:  npm start      then open http://localhost:3000
 */
try { process.loadEnvFile(); } catch { /* no .env file — defaults are used */ }

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, DB_FILE, SCHEMA } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const SESSION_HOURS = 12;
if (!process.env.ADMIN_PASSWORD) {
  console.warn('\n⚠️  ADMIN_PASSWORD is not set — using the default "change-me". Copy .env.example to .env and set a strong password before going live.\n');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

// ---------- helpers ----------
const fieldsOf = (table) => SCHEMA[table].fields;
const fieldNames = (table) => fieldsOf(table).map((f) => f.name);

function cleanRow(table, input, { partial = false } = {}) {
  const out = {};
  const errors = [];
  for (const f of fieldsOf(table)) {
    if (partial && !(f.name in input)) continue;
    let v = input[f.name];
    if (f.type === 'checkbox') {
      v = v === true || v === 1 || v === '1' || v === 'true' || v === 'on' || v === 'yes' ? 1 : 0;
    } else if (f.type === 'number') {
      v = v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[,₹\s]/g, ''));
      if (v !== null && !Number.isFinite(v)) { errors.push(`${f.label} must be a number`); v = null; }
    } else {
      v = v === null || v === undefined ? '' : String(v).trim().slice(0, 5000);
    }
    if (f.required && (v === '' || v === null)) errors.push(`${f.label} is required`);
    out[f.name] = v;
  }
  return { row: out, errors };
}

function insertRow(table, row) {
  const cols = Object.keys(row);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  return Number(stmt.run(...cols.map((c) => row[c])).lastInsertRowid);
}

const hits = new Map(); // simple in-memory rate limiter
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

function toCsv(table, rows) {
  const cols = ['id', ...fieldNames(table), 'created_at', 'updated_at'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- public API ----------
for (const [table, def] of Object.entries(SCHEMA)) {
  if (!def.public) continue;
  app.get(`/api/public/${table}`, (req, res) => {
    const rows = db.prepare(
      `SELECT ${def.public.join(',')} FROM ${table} WHERE ${def.publicWhere || '1=1'} ORDER BY ${def.publicOrder || 'id DESC'} LIMIT 200`
    ).all();
    res.json(rows);
  });
}

app.post('/api/public/enquiry', (req, res) => {
  if (rateLimit(`enq:${req.ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many enquiries from this device. Please call us instead.' });
  }
  const body = req.body || {};
  if (body.website) return res.json({ ok: true }); // hidden honeypot field: bots fill it, humans don't
  const allowed = ['student_name', 'parent_name', 'phone', 'email', 'class_grade', 'course', 'mode', 'message'];
  const input = Object.fromEntries(allowed.map((k) => [k, body[k]]));
  const { row, errors } = cleanRow('enquiries', input);
  if (row.phone && !/^[+\d][\d\s-]{6,15}$/.test(row.phone)) errors.push('Please enter a valid phone number');
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  row.status = 'New';
  row.followup_notes = '';
  insertRow('enquiries', row);
  res.json({ ok: true });
});

// ---------- admin auth ----------
const sessions = new Map(); // token -> expiry time
function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function requireAdmin(req, res, next) {
  const token = getCookie(req, 'srvp_admin');
  const exp = token && sessions.get(token);
  if (!exp || exp < Date.now()) return res.status(401).json({ error: 'Please log in' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (rateLimit(`login:${req.ip}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  }
  const { username, password } = req.body || {};
  const ok = safeEqual(username || '', ADMIN_USER) & safeEqual(password || '', ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'Wrong username or password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.set('Set-Cookie', `srvp_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  sessions.delete(getCookie(req, 'srvp_admin'));
  res.set('Set-Cookie', 'srvp_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.use('/api/admin', (req, res, next) => (req.path === '/login' ? next() : requireAdmin(req, res, next)));

app.get('/api/admin/me', (req, res) => res.json({ user: ADMIN_USER }));
app.get('/api/admin/schema', (req, res) => res.json(SCHEMA));

app.get('/api/admin/stats', (req, res) => {
  const one = (sql) => Object.values(db.prepare(sql).get())[0] || 0;
  res.json({
    students: one("SELECT COUNT(*) FROM students WHERE status IS NULL OR status IN ('', 'Active')"),
    online: one("SELECT COUNT(*) FROM students WHERE mode='Online' AND (status IS NULL OR status IN ('', 'Active'))"),
    offline: one("SELECT COUNT(*) FROM students WHERE mode='Offline' AND (status IS NULL OR status IN ('', 'Active'))"),
    faculty: one("SELECT COUNT(*) FROM faculty WHERE status IS NULL OR status IN ('', 'Active')"),
    newEnquiries: one("SELECT COUNT(*) FROM enquiries WHERE status='New'"),
    feeTotal: one('SELECT SUM(COALESCE(fee_total,0)) FROM students'),
    feePaid: one('SELECT SUM(COALESCE(fee_paid,0)) FROM students'),
  });
});

app.get('/api/admin/backup', (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.download(DB_FILE, `srvp-backup-${stamp}.db`);
});

app.param('table', (req, res, next, table) => {
  if (!Object.prototype.hasOwnProperty.call(SCHEMA, table)) return res.status(404).json({ error: 'Unknown table' });
  next();
});

function listRows(table, query) {
  const def = SCHEMA[table];
  const where = [];
  const args = [];
  if (query.q) {
    const text = def.fields.filter((f) => f.type !== 'number' && f.type !== 'checkbox').map((f) => f.name);
    where.push(`(${text.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    text.forEach(() => args.push(`%${query.q}%`));
  }
  for (const f of def.filters || []) {
    if (query[f]) { where.push(`${f} = ?`); args.push(String(query[f])); }
  }
  const sql = `SELECT * FROM ${table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`;
  return db.prepare(sql).all(...args);
}

app.get('/api/admin/:table', (req, res) => res.json(listRows(req.params.table, req.query)));

app.get('/api/admin/:table/export.csv', (req, res) => {
  const { table } = req.params;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="srvp-${table}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(table, listRows(table, req.query)));
});

app.post('/api/admin/:table/import', (req, res) => {
  const { table } = req.params;
  const rows = parseCsv(typeof req.body === 'string' ? req.body : '');
  if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one data row' });
  // Header may use field names (full_name) or labels (Full Name)
  const lookup = {};
  for (const f of fieldsOf(table)) { lookup[f.name.toLowerCase()] = f.name; lookup[f.label.toLowerCase()] = f.name; }
  const header = rows[0].map((h) => lookup[h.trim().toLowerCase()] || null);
  if (!header.some(Boolean)) return res.status(400).json({ error: 'No CSV columns match the field names — download a CSV export to see the expected header.' });
  let added = 0;
  const failed = [];
  db.exec('BEGIN');
  try {
    rows.slice(1).forEach((cells, i) => {
      const input = {};
      header.forEach((name, j) => { if (name) input[name] = cells[j]; });
      const { row, errors } = cleanRow(table, input);
      if (errors.length) failed.push(`Row ${i + 2}: ${errors.join(', ')}`);
      else { insertRow(table, row); added++; }
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ added, failed });
});

app.post('/api/admin/:table', (req, res) => {
  const { table } = req.params;
  const { row, errors } = cleanRow(table, req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  res.json({ id: insertRow(table, row) });
});

app.put('/api/admin/:table/:id', (req, res) => {
  const { table, id } = req.params;
  const { row, errors } = cleanRow(table, req.body || {}, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  const cols = Object.keys(row);
  if (!cols.length) return res.status(400).json({ error: 'Nothing to update' });
  const r = db.prepare(
    `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(...cols.map((c) => row[c]), Number(id));
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/:table/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM ${req.params.table} WHERE id = ?`).run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ---------- static website ----------
// maxAge 0 = browser always re-checks files, so your edits show up on a normal refresh
// (visiting /admin automatically redirects to /admin/ — the Admin Panel)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`SRVP website running:  http://localhost:${PORT}`);
  console.log(`Admin panel:           http://localhost:${PORT}/admin`);
});
