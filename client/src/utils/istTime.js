// Server timestamps are stored as UTC 'YYYY-MM-DD HH:MM:SS' without a zone marker
export function parseUtc(value) {
  if (!value) return null;
  const iso = typeof value === 'string' && !value.includes('T') ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(value) {
  const d = parseUtc(value);
  if (!d) return '—';
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtTime(value) {
  const d = parseUtc(value);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

export function istToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function minutesLabel(mins) {
  if (mins === null || mins === undefined) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
