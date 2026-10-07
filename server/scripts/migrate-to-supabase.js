// One-time copy of the local SQLite database (server/hygiene360.db) and photos (server/uploads) into Supabase.
//
//   npm run migrate:supabase                 copy data + photos (target database must be empty)
//   npm run migrate:supabase -- --reset      wipe the Supabase tables first, then copy
//   npm run migrate:supabase -- --skip-photos
//   npm run migrate:supabase -- --photos-only   upload server/uploads again (data untouched)
//
// Needs DATABASE_URL (and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for photos) in the root .env.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env - nothing to migrate to.');
  process.exit(1);
}

const { DatabaseSync } = require('node:sqlite');
const pg = require('../db/pg');
const storage = require('../utils/storage');

const SQLITE_FILE = path.join(__dirname, '..', 'hygiene360.db');
const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const SKIP_PHOTOS = args.has('--skip-photos');
const PHOTOS_ONLY = args.has('--photos-only');
const BATCH = 200;

// Parent tables first so foreign keys resolve
const TABLES = [
  'plants', 'users', 'buildings', 'blocks', 'floors', 'areas', 'toilets', 'qr_codes', 'shifts', 'assignments',
  'checklist_items', 'cleaning_sessions', 'checklist_responses', 'supervisor_inspections', 'issues',
  'evidence_photos', 'issue_updates', 'issue_categories', 'drinking_water_checks', 'notifications', 'audit_logs',
  'system_settings', 'master_reference_photos', 'cleaning_slots', 'slot_notification_log', 'employee_evaluations',
  'whatsapp_log', 'toilet_reference_photos'
];

const q = id => `"${id}"`;

function toPg(v) {
  if (v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Uint8Array) return Buffer.from(v);
  return v;
}

async function pgColumns(table) {
  const { rows } = await pg.pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
    [table]
  );
  return new Set(rows.map(r => r.column_name));
}

async function insertRows(table, cols, rows) {
  const values = [];
  const tuples = rows.map((row, r) => {
    const ph = cols.map((c, i) => { values.push(toPg(row[c])); return `$${r * cols.length + i + 1}`; });
    return `(${ph.join(',')})`;
  });
  await pg.pool.query(
    `INSERT INTO ${q(table)} (${cols.map(q).join(',')}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`,
    values
  );
}

async function copyTable(sqlite, table) {
  const exists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) { console.log(`  ${table}: not in local database, skipped`); return; }

  const target = await pgColumns(table);
  const cols = sqlite.prepare(`PRAGMA table_info(${q(table)})`).all().map(c => c.name).filter(c => target.has(c));
  const rows = sqlite.prepare(`SELECT * FROM ${q(table)}${cols.includes('id') ? ' ORDER BY id' : ''}`).all();
  let copied = 0, skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    try {
      await insertRows(table, cols, chunk);
      copied += chunk.length;
    } catch (e) {
      // Fall back to row-by-row so one bad / orphan row doesn't block the rest
      for (const row of chunk) {
        try { await insertRows(table, cols, [row]); copied++; }
        catch (err) { skipped++; console.warn(`    ${table} id=${row.id ?? '?'} skipped: ${err.message}`); }
      }
    }
  }

  if (cols.includes('id')) {
    await pg.pool.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${q(table)}), 1), (SELECT MAX(id) FROM ${q(table)}) IS NOT NULL)`,
      [table]
    ).catch(() => {});
  }
  console.log(`  ${table}: ${copied} copied${skipped ? `, ${skipped} skipped` : ''}`);
}

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

async function copyPhotos() {
  if (!storage.useSupabase) {
    console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set - photos skipped.');
    return;
  }
  const files = listFiles(storage.LOCAL_ROOT);
  console.log(`Uploading ${files.length} photos to Supabase Storage...`);
  let done = 0, failed = 0;
  for (const rel of files) {
    try {
      await storage.save(`/uploads/${rel}`, fs.readFileSync(path.join(storage.LOCAL_ROOT, rel)));
      done++;
    } catch (e) {
      failed++;
      console.warn(`  ${rel}: ${e.message}`);
    }
    if ((done + failed) % 50 === 0) console.log(`  ${done + failed}/${files.length}`);
  }
  console.log(`Photos: ${done} uploaded${failed ? `, ${failed} failed` : ''}`);
}

async function main() {
  if (PHOTOS_ONLY) return copyPhotos();
  if (!fs.existsSync(SQLITE_FILE)) throw new Error(`Local database not found: ${SQLITE_FILE}`);
  const sqlite = new DatabaseSync(SQLITE_FILE, { readOnly: true });

  console.log('Creating Supabase tables...');
  await pg.initSchema();

  const { rows } = await pg.pool.query('SELECT COUNT(*)::int AS c FROM plants');
  if (rows[0].c > 0 && !RESET) {
    throw new Error('Supabase already has data. Re-run with --reset to wipe it and copy again.');
  }
  // Clears the default rows created by the schema so local values win
  await pg.pool.query(`TRUNCATE ${TABLES.map(q).join(', ')} RESTART IDENTITY CASCADE`);

  console.log('Copying tables...');
  for (const t of TABLES) await copyTable(sqlite, t);
  sqlite.close();

  if (!SKIP_PHOTOS) await copyPhotos();
  console.log('Migration finished.');
}

main()
  .catch(err => { console.error('Migration failed:', err.message); process.exitCode = 1; })
  .finally(() => pg.pool.end());
