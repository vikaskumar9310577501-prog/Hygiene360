import React from 'react';

const CHART_H = 150;
const GRID = [100, 75, 50, 25, 0];

export function pctColor(v) {
  if (v >= 90) return '#10b981';
  if (v >= 70) return '#0ea5e9';
  if (v > 0) return '#f59e0b';
  return '#ef4444';
}

export function PctLegend() {
  const items = [
    { c: '#10b981', l: '90–100% Good' },
    { c: '#0ea5e9', l: '70–89% Fair' },
    { c: '#f59e0b', l: '1–69% Low' },
    { c: '#ef4444', l: '0% Not cleaned' }
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '10.5px', color: '#475569', marginTop: '8px' }}>
      {items.map(i => (
        <span key={i.l} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: i.c }} />{i.l}
        </span>
      ))}
    </div>
  );
}

function Axis({ labels, unit = '' }) {
  return (
    <div style={{ position: 'relative', width: '34px', height: CHART_H, flexShrink: 0 }}>
      {labels.map((v, i) => (
        <span key={i} style={{
          position: 'absolute', right: '6px', top: `${(i / (labels.length - 1)) * 100}%`, transform: 'translateY(-50%)',
          fontSize: '9.5px', color: '#94a3b8', fontWeight: 600
        }}>{v}{unit}</span>
      ))}
    </div>
  );
}

function GridLines({ count }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', left: 0, right: 0, top: `${(i / (count - 1)) * 100}%`,
          borderTop: i === count - 1 ? '1.5px solid #cbd5e1' : '1px dashed #e2e8f0'
        }} />
      ))}
    </>
  );
}

/**
 * Bar chart on a fixed 0–100% scale.
 * items: [{ label, value (0-100), detail (tooltip / caption), highlight }]
 */
export function PercentBarChart({ items = [] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <Axis labels={GRID} unit="%" />
        <div style={{ position: 'relative', flex: 1, height: CHART_H }}>
          <GridLines count={GRID.length} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '0 4px' }}>
            {items.map((it, i) => {
              if (it.value == null) {
                return (
                  <div key={i} title={`${it.label}: no data`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>No data</span>
                  </div>
                );
              }
              const v = Math.round(Math.max(0, Math.min(100, Number(it.value) || 0)));
              return (
                <div key={i} title={it.detail || `${it.label}: ${v}%`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: v === 0 ? '#ef4444' : '#0f172a', marginBottom: '3px' }}>{v}%</span>
                  <div style={{
                    width: '100%', maxWidth: '36px', height: `${v}%`, minHeight: v > 0 ? '3px' : 0,
                    background: pctColor(v), borderRadius: '5px 5px 0 0',
                    outline: it.highlight ? '2px solid #0f172a' : 'none', outlineOffset: '1px', transition: 'height 0.3s ease'
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', marginLeft: '34px', gap: '8px', padding: '6px 4px 0' }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: '10.5px', fontWeight: it.highlight ? 800 : 600, color: it.highlight ? '#0369a1' : '#475569', whiteSpace: 'nowrap' }}>{it.label}</div>
            {it.caption && <div style={{ fontSize: '9.5px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{it.caption}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Side-by-side bars of two counts per period (e.g. expected vs cleaned).
 * items: [{ label, a, b, highlight }]
 */
export function PairBarChart({ items = [], aLabel, bLabel, aColor = '#cbd5e1', bColor = '#10b981' }) {
  const max = Math.max(1, ...items.map(i => Math.max(i.a || 0, i.b || 0)));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const labels = [top, step * 3, step * 2, step, 0];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <Axis labels={labels} />
        <div style={{ position: 'relative', flex: 1, height: CHART_H }}>
          <GridLines count={labels.length} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '0 4px' }}>
            {items.map((it, i) => (
              <div key={i} title={`${it.label}: ${it.b} of ${it.a} ${bLabel.toLowerCase()}`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3px' }}>
                {[{ v: it.a, c: aColor, tc: '#64748b' }, { v: it.b, c: bColor, tc: '#047857' }].map((bar, j) => (
                  <div key={j} style={{ flex: 1, maxWidth: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: bar.tc, marginBottom: '2px' }}>{bar.v}</span>
                    <div style={{ width: '100%', height: `${(bar.v / top) * 100}%`, minHeight: bar.v > 0 ? '3px' : 0, background: bar.c, borderRadius: '4px 4px 0 0' }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', marginLeft: '34px', gap: '8px', padding: '6px 4px 0' }}>
        {items.map((it, i) => {
          const pct = it.a ? Math.round((it.b / it.a) * 100) : 0;
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: '10.5px', fontWeight: it.highlight ? 800 : 600, color: it.highlight ? '#0369a1' : '#475569', whiteSpace: 'nowrap' }}>{it.label}</div>
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: pctColor(pct), whiteSpace: 'nowrap' }}>{it.b}/{it.a}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '12px', fontSize: '10.5px', color: '#475569', marginTop: '8px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '9px', height: '9px', borderRadius: '2px', background: aColor }} />{aLabel}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '9px', height: '9px', borderRadius: '2px', background: bColor }} />{bLabel}</span>
      </div>
    </div>
  );
}

export function ChartHint({ children }) {
  return <div style={{ fontSize: '11px', color: '#64748b', margin: '-2px 0 10px' }}>{children}</div>;
}
