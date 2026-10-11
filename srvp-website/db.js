/*
 * Database layer. Uses SQLite (built into Node.js 22.13+), stored in
 * data/srvp.db — a single file you can back up by copying it, or open
 * with the free "DB Browser for SQLite" app to view/edit by hand.
 *
 * Tables and columns come from schema.js; missing columns are added
 * automatically on startup, so editing schema.js never loses data.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const SCHEMA = require('./schema');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'srvp.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);

const sqlType = (f) => (f.type === 'number' ? 'REAL' : f.type === 'checkbox' ? 'INTEGER' : 'TEXT');
const NAME_RE = /^[a-z][a-z0-9_]*$/;

for (const [table, def] of Object.entries(SCHEMA)) {
  if (!NAME_RE.test(table)) throw new Error(`Bad table name in schema.js: ${table}`);
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const f of def.fields) {
    if (!NAME_RE.test(f.name)) throw new Error(`Bad field name in schema.js: ${table}.${f.name}`);
    if (!existing.has(f.name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${f.name} ${sqlType(f)}`);
  }
}

module.exports = { db, DB_FILE, SCHEMA };
