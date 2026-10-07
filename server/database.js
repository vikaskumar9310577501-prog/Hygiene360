// Database entry point: Supabase / PostgreSQL when DATABASE_URL is set, otherwise the local SQLite file.
// Every method is async: always `await db.get(...)`, `await db.all(...)`, `await db.run(...)`.
require('dotenv').config();

const usePg = !!process.env.DATABASE_URL;

// Serverless disks are read-only, so the SQLite fallback cannot work there
function missingDatabase() {
  const fail = async () => { throw new Error('DATABASE_URL is not configured on the server. Add it in Vercel > Settings > Environment Variables and redeploy.'); };
  return { dialect: 'none', initSchema: fail, all: fail, get: fail, run: fail, exec: fail };
}

const impl = usePg ? require('./db/pg') : process.env.VERCEL ? missingDatabase() : require('./db/sqlite');

function sanitizeUidPart(value) {
  return String(value || '').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Toilet ID printed in the QR, e.g. TOILET-SUPA-BLOCK-A-01
function buildToiletUid(plantCode, locationCode, toiletCode) {
  const parts = ['TOILET', sanitizeUidPart(plantCode), sanitizeUidPart(locationCode), sanitizeUidPart(toiletCode)].filter(Boolean);
  return parts.join('-');
}

async function uniqueToiletUid(base, excludeToiletId = null) {
  let candidate = base;
  let n = 2;
  while (await impl.get('SELECT id FROM toilets WHERE toilet_uid = ? AND id IS NOT ?', [candidate, excludeToiletId])) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

async function backfillToiletUids() {
  const missing = await impl.all(`
    SELECT t.id, t.code, p.code as plant_code, bl.code as block_code, b.code as building_code
    FROM toilets t
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN areas a ON t.area_id = a.id
    LEFT JOIN floors f ON a.floor_id = f.id
    LEFT JOIN blocks bl ON f.block_id = bl.id
    LEFT JOIN buildings b ON f.building_id = b.id
    WHERE t.toilet_uid IS NULL OR t.toilet_uid = ''
  `);
  for (const t of missing) {
    const uid = await uniqueToiletUid(buildToiletUid(t.plant_code, t.block_code || t.building_code, t.code), t.id);
    await impl.run('UPDATE toilets SET toilet_uid = ? WHERE id = ?', [uid, t.id]);
  }
}

// A failed init (e.g. database briefly unreachable on a cold start) is retried on the next request
let readyPromise = null;
function ensureReady() {
  if (impl.dialect === 'none') return impl.initSchema();
  if (!usePg) return Promise.resolve();
  if (!readyPromise) {
    readyPromise = (async () => {
      await impl.initSchema();
      await backfillToiletUids();
      console.log('Connected to Supabase / PostgreSQL');
    })().catch(err => {
      console.error('PostgreSQL init failed:', err.message);
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}
ensureReady().catch(() => {});

module.exports = {
  dialect: impl.dialect,
  ensureReady,
  all: (sql, params) => impl.all(sql, params),
  get: (sql, params) => impl.get(sql, params),
  run: (sql, params) => impl.run(sql, params),
  exec: (sql) => impl.exec(sql),
  buildToiletUid,
  uniqueToiletUid,
  impl
};
