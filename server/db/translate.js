// Translates the SQLite dialect used across the routes into PostgreSQL.
// Timestamps are kept as TEXT ('YYYY-MM-DD HH:MM:SS', UTC) exactly like SQLite's CURRENT_TIMESTAMP.

const NOW_TXT = "to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')";
const TODAY_TXT = "to_char((now() at time zone 'utc'), 'YYYY-MM-DD')";

const cache = new Map();

function splitLiterals(sql) {
  const parts = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      if (buf) { parts.push({ code: true, text: buf }); buf = ''; }
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      parts.push({ code: false, text: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf) parts.push({ code: true, text: buf });
  return parts;
}

function translate(sql) {
  const hit = cache.get(sql);
  if (hit) return hit;

  let s = sql
    .replace(/\bdatetime\(\s*'now'\s*\)/gi, NOW_TXT)
    .replace(/\bdate\(\s*'now'\s*\)/gi, TODAY_TXT);

  let ignoreConflict = false;
  let n = 0;
  const out = splitLiterals(s).map(p => {
    if (!p.code) return p.text;
    let t = p.text;
    if (/INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO/i.test(t)) {
      ignoreConflict = true;
      t = t.replace(/INSERT\s+OR\s+(IGNORE|REPLACE)\s+INTO/gi, 'INSERT INTO');
    }
    t = t
      .replace(/\bCURRENT_TIMESTAMP\b/gi, NOW_TXT)
      .replace(/\bIS\s+NOT\s+\?/gi, 'IS DISTINCT FROM ?')
      .replace(/\bIFNULL\s*\(/gi, 'COALESCE(')
      .replace(/\bGROUP_CONCAT\s*\(\s*(DISTINCT\s+)?([A-Za-z_][\w.]*)\s*\)/gi, (m, d, col) => `string_agg(${d || ''}${col}::text, ',')`)
      .replace(/\bdate\s*\(\s*([A-Za-z_][\w.]*)\s*\)/gi, 'substr($1, 1, 10)')
      .replace(/(\bNOT\s+)?\bLIKE\b/gi, (m, not) => `${not || ''}ILIKE`)
      .replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/gi, (m, alias) => (/[a-z]/.test(alias) && /[A-Z]/.test(alias) ? `AS "${alias}"` : m))
      .replace(/\?/g, () => `$${++n}`);
    return t;
  });
  s = out.join('');

  if (/^\s*INSERT\b/i.test(s)) {
    s = s.replace(/;\s*$/, '');
    if (ignoreConflict && !/\bON\s+CONFLICT\b/i.test(s)) s += ' ON CONFLICT DO NOTHING';
    if (!/\bRETURNING\b/i.test(s)) s += ' RETURNING *';
  }

  cache.set(sql, s);
  return s;
}

module.exports = { translate, NOW_TXT, TODAY_TXT };
