const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const { translate } = require('./translate');

// COUNT(*) / SUM come back as bigint and NUMERIC as strings by default
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 3),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000
});

pool.on('error', err => console.error('Postgres pool error:', err.message));

async function query(sql, params = []) {
  const text = translate(sql);
  try {
    return await pool.query(text, params.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)));
  } catch (err) {
    err.message = `${err.message} [SQL: ${text.replace(/\s+/g, ' ').slice(0, 300)}]`;
    throw err;
  }
}

async function initSchema() {
  const ddl = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  await pool.query(ddl);
}

module.exports = {
  dialect: 'pg',
  pool,
  initSchema,
  async all(sql, params = []) {
    return (await query(sql, params)).rows;
  },
  async get(sql, params = []) {
    return (await query(sql, params)).rows[0];
  },
  async run(sql, params = []) {
    const r = await query(sql, params);
    const first = r.rows && r.rows[0];
    return { changes: r.rowCount, lastInsertRowid: first && first.id !== undefined ? first.id : undefined };
  },
  async exec(sql) {
    await pool.query(sql);
  }
};
