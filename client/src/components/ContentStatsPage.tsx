import { useEffect, useMemo, useState } from "react";
import { api, type ContentLevelStats, type ContentStatsData } from "../api";

type Props = {
  canModerate: boolean;
};

// ── helpers ──────────────────────────────────────────────────────────────────

function cellColorClass(s: ContentLevelStats): string {
  const levels = [s.a1, s.a2, s.b1, s.b2];
  if (levels.some((n) => n < 5)) return "cell-red";
  if (levels.some((n) => n < 10)) return "cell-yellow";
  return "cell-green";
}

// ── shared chart card ─────────────────────────────────────────────────────────

function ChartCard({ title, sub, right, children }: {
  title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <article className="chart-card-new">
      <header className="chart-card-new-head">
        <div>
          <h3 className="chart-card-title">{title}</h3>
          {sub && <div className="chart-card-sub">{sub}</div>}
        </div>
        {right}
      </header>
      {children}
    </article>
  );
}

// ── KPI cards ─────────────────────────────────────────────────────────────────

function KpiCards({ data }: { data: ContentStatsData }) {
  const { total, avgFill, red, yellow, green } = useMemo(() => {
    let t = 0, r = 0, y = 0, g = 0;
    for (const lang of data.languages) {
      for (const cat of data.categories) {
        const cell = data.coverage[lang.id]?.[cat.id];
        if (!cell) continue;
        t += cell.total;
        const lvls = [cell.a1, cell.a2, cell.b1, cell.b2];
        if (lvls.some((n) => n < 5)) r++;
        else if (lvls.some((n) => n < 10)) y++;
        else g++;
      }
    }
    const cells = data.languages.length * data.categories.length;
    return { total: t, avgFill: cells ? +(t / cells).toFixed(1) : 0, red: r, yellow: y, green: g };
  }, [data]);

  return (
    <section className="kpi-grid">
      {[
        { label: "Total exercises", value: total.toLocaleString(), unit: "", sub: `across ${data.languages.length} languages` },
        { label: "Avg per cell",    value: avgFill,                unit: "",  sub: `${data.languages.length} langs × ${data.categories.length} cats` },
        { label: "Well filled",     value: green,                  unit: " cells", sub: "all levels ≥ 10", accent: "var(--good)" },
        { label: "Needs work",      value: red + yellow,           unit: " cells", sub: `${red} critical · ${yellow} low`, accent: "var(--accent)" },
      ].map((k) => (
        <article key={k.label} className="kpi-card">
          <div className="kpi-card-label">{k.label}</div>
          <div className="kpi-card-value" style={k.accent ? { color: k.accent } : undefined}>
            <span className="kpi-card-num">{k.value}</span>
            <span className="kpi-card-unit">{k.unit}</span>
          </div>
          <div className="kpi-card-foot">
            <span className="kpi-delta delta-flat">{k.sub}</span>
          </div>
        </article>
      ))}
    </section>
  );
}

// ── stacked bar chart: CEFR distribution per language ────────────────────────

const LEVEL_COLORS = ["var(--err-0)", "var(--err-1)", "var(--err-2)", "var(--err-3)"];
const LEVEL_LABELS = ["A1", "A2", "B1", "B2"];

function LangStackedChart({ data }: { data: ContentStatsData }) {
  const W = 600, H = 200, PL = 16, PR = 16, PT = 20, PB = 32;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;

  const langTotals = useMemo(() => data.languages.map((lang) => {
    const a1 = data.categories.reduce((s, c) => s + (data.coverage[lang.id]?.[c.id]?.a1 ?? 0), 0);
    const a2 = data.categories.reduce((s, c) => s + (data.coverage[lang.id]?.[c.id]?.a2 ?? 0), 0);
    const b1 = data.categories.reduce((s, c) => s + (data.coverage[lang.id]?.[c.id]?.b1 ?? 0), 0);
    const b2 = data.categories.reduce((s, c) => s + (data.coverage[lang.id]?.[c.id]?.b2 ?? 0), 0);
    return { lang, a1, a2, b1, b2, total: a1 + a2 + b1 + b2 };
  }), [data]);

  const maxTotal = Math.max(...langTotals.map((l) => l.total), 1);
  const barW = Math.min(60, (innerW / data.languages.length) * 0.55);
  const slot = innerW / data.languages.length;

  const yTicks = [0, 0.5, 1].map((t) => Math.round(maxTotal * t));

  return (
    <div className="chart-svg-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {yTicks.map((v, i) => {
          const y = PT + innerH - (v / maxTotal) * innerH;
          return (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--hairline)" strokeDasharray="2 4"/>
              <text x={PL - 4} y={y + 3} className="chart-tick" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {langTotals.map(({ lang, a1, a2, b1, b2, total }, i) => {
          const cx = PL + slot * i + slot / 2;
          const segments = [a1, a2, b1, b2];
          let stackY = PT + innerH;
          return (
            <g key={lang.id}>
              {segments.map((seg, si) => {
                const sh = (seg / maxTotal) * innerH;
                stackY -= sh;
                return (
                  <rect key={si} x={cx - barW / 2} y={stackY} width={barW} height={sh}
                    fill={LEVEL_COLORS[si]} rx={si === 3 ? 3 : 0}/>
                );
              })}
              <text x={cx} y={H - 10} className="chart-tick" textAnchor="middle">{lang.flag}</text>
              <text x={cx} y={H - 1} className="chart-tick" textAnchor="middle" style={{ fontSize: "9px" }}>{lang.label}</text>
              {total > 0 && (
                <text x={cx} y={PT + innerH - (total / maxTotal) * innerH - 5}
                  className="chart-num mono" textAnchor="middle">{total}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="cov-legend">
        {LEVEL_LABELS.map((lbl, i) => (
          <span key={lbl} className="cov-legend-item">
            <i style={{ background: LEVEL_COLORS[i] }}/>
            {lbl}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── horizontal bar chart: total exercises per category ───────────────────────

function CategoryFillChart({ data }: { data: ContentStatsData }) {
  const W = 600, ROW_H = 24, PAD = 4, LABEL_W = 150, BAR_GAP = 8, RIGHT_PAD = 50;

  const rows = useMemo(() => {
    return data.categories.map((cat) => {
      const total = data.languages.reduce((s, lang) =>
        s + (data.coverage[lang.id]?.[cat.id]?.total ?? 0), 0);
      return { cat, total };
    }).sort((a, b) => b.total - a.total);
  }, [data]);

  const maxTotal = Math.max(...rows.map((r) => r.total), 1);
  const H = rows.length * (ROW_H + PAD) + PAD;
  const barW = W - LABEL_W - BAR_GAP - RIGHT_PAD;
  const ideal = 10 * data.languages.length;

  return (
    <div className="chart-svg-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
        {rows.map(({ cat, total }, i) => {
          const y = PAD + i * (ROW_H + PAD);
          const filled = (total / maxTotal) * barW;
          const idealX = LABEL_W + BAR_GAP + Math.min(1, ideal / maxTotal) * barW;
          return (
            <g key={cat.id}>
              <text x={LABEL_W - 6} y={y + ROW_H / 2 + 4} className="chart-tick" textAnchor="end"
                style={{ fontSize: "11px" }}>
                {cat.label}
              </text>
              <rect x={LABEL_W + BAR_GAP} y={y + 4} width={barW} height={ROW_H - 8}
                fill="var(--hairline)" rx="3"/>
              <rect x={LABEL_W + BAR_GAP} y={y + 4} width={filled} height={ROW_H - 8}
                fill="var(--ink)" rx="3"/>
              <line x1={idealX} x2={idealX} y1={y + 2} y2={y + ROW_H - 2}
                stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2 2"/>
              <text x={LABEL_W + BAR_GAP + filled + 5} y={y + ROW_H / 2 + 4}
                className="chart-num mono" style={{ fontSize: "11px" }}>{total}</text>
            </g>
          );
        })}
      </svg>
      <div className="cov-legend" style={{ marginTop: 6 }}>
        <span className="cov-legend-item"><i style={{ background: "var(--ink)" }}/> Total exercises</span>
        <span className="cov-legend-item"><i style={{ background: "var(--accent)", borderRadius: 1 }}/> Target (10 × languages)</span>
      </div>
    </div>
  );
}

// ── gap donut ─────────────────────────────────────────────────────────────────

function GapDonut({ data }: { data: ContentStatsData }) {
  const { red, yellow, green } = useMemo(() => {
    let r = 0, y = 0, g = 0;
    for (const lang of data.languages) {
      for (const cat of data.categories) {
        const cell = data.coverage[lang.id]?.[cat.id];
        if (!cell) continue;
        const lvls = [cell.a1, cell.a2, cell.b1, cell.b2];
        if (lvls.some((n) => n < 5)) r++;
        else if (lvls.some((n) => n < 10)) y++;
        else g++;
      }
    }
    return { red: r, yellow: y, green: g };
  }, [data]);

  const total = red + yellow + green;
  const segments = [
    { label: "Well filled (≥10)", count: green, color: "var(--good)" },
    { label: "Low (5–9)",         count: yellow, color: "var(--warn)" },
    { label: "Critical (<5)",     count: red,    color: "var(--accent)" },
  ].filter((s) => s.count > 0);

  const R = 52, S = 14, CX = 66, CY = 66;
  let cumulative = 0;

  return (
    <div className="errors-layout">
      <div style={{ display: "grid", placeItems: "center" }}>
        <svg viewBox="0 0 132 132" width="132" height="132">
          {segments.map((seg, i) => {
            const frac = seg.count / total;
            const a0 = cumulative * Math.PI * 2 - Math.PI / 2;
            const a1 = (cumulative + frac) * Math.PI * 2 - Math.PI / 2;
            const large = frac > 0.5 ? 1 : 0;
            const x0 = CX + R * Math.cos(a0), y0 = CY + R * Math.sin(a0);
            const x1 = CX + R * Math.cos(a1), y1 = CY + R * Math.sin(a1);
            cumulative += frac;
            return (
              <path key={i}
                d={`M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`}
                fill="none" stroke={seg.color} strokeWidth={S}/>
            );
          })}
          <text x={CX} y={CY - 6} className="donut-num" textAnchor="middle">{total}</text>
          <text x={CX} y={CX + 8} className="donut-sub" textAnchor="middle">cells</text>
        </svg>
      </div>
      <ul className="errors-list-new">
        {segments.map((seg) => (
          <li key={seg.label}>
            <span className="err-dot" style={{ background: seg.color }}/>
            <span>{seg.label}</span>
            <div className="err-bar">
              <div className="err-bar-fill" style={{ width: `${(seg.count / total) * 100}%`, background: seg.color }}/>
            </div>
            <span className="err-count">{seg.count}</span>
            <span className="err-pct">{Math.round((seg.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── type breakdown (expanded cell) ────────────────────────────────────────────

function TypeBreakdown({ types }: { types: Record<string, number> }) {
  return (
    <div className="type-breakdown">
      {Object.entries(types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
        <span key={type} className="type-chip">{type}: {count}</span>
      ))}
    </div>
  );
}

// ── coverage grid table ───────────────────────────────────────────────────────

function CoverageGrid({ data }: { data: ContentStatsData }) {
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  return (
    <div className="coverage-grid-wrap">
      <table className="coverage-table">
        <thead>
          <tr>
            <th className="cat-header">Category</th>
            {data.languages.map((lang) => (
              <th key={lang.id} className="lang-header">{lang.flag} {lang.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.categories.map((cat) => (
            <tr key={cat.id}>
              <td className="cat-label">{cat.label}</td>
              {data.languages.map((lang) => {
                const cell = data.coverage[lang.id]?.[cat.id];
                if (!cell) return <td key={lang.id} className="coverage-cell cell-empty">—</td>;
                const key = `${lang.id}:${cat.id}`;
                const expanded = expandedCell === key;
                return (
                  <td key={lang.id}
                    className={`coverage-cell ${cellColorClass(cell)}${expanded ? " expanded" : ""}`}
                    onClick={() => setExpandedCell(expanded ? null : key)}
                    title="Click for exercise type breakdown">
                    <div className="cell-levels">
                      {(["a1", "a2", "b1", "b2"] as const).map((lvl) => {
                        const n = cell[lvl];
                        const fg = n < 5 ? "var(--cov-red-fg)" : n < 10 ? "var(--cov-yellow-fg)" : undefined;
                        return (
                          <span key={lvl} style={fg ? { color: fg, fontWeight: 700 } : undefined}>
                            {lvl.toUpperCase()}:{n}
                          </span>
                        );
                      })}
                    </div>
                    <div className="cell-total">({cell.total})</div>
                    {expanded ? <TypeBreakdown types={cell.types}/> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="cat-label foot-label">Total</td>
            {data.languages.map((lang) => {
              const t = data.categories.reduce((s, cat) => s + (data.coverage[lang.id]?.[cat.id]?.total ?? 0), 0);
              return <td key={lang.id} className="coverage-cell foot-total">{t}</td>;
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── summary chips ─────────────────────────────────────────────────────────────

function SummaryChips({ data }: { data: ContentStatsData }) {
  const { total, red, yellow } = useMemo(() => {
    let t = 0, r = 0, y = 0;
    for (const lang of data.languages) {
      for (const cat of data.categories) {
        const cell = data.coverage[lang.id]?.[cat.id];
        if (!cell) continue;
        t += cell.total;
        const lvls = [cell.a1, cell.a2, cell.b1, cell.b2];
        if (lvls.some((n) => n < 5)) r++;
        else if (lvls.some((n) => n < 10)) y++;
      }
    }
    return { total: t, red: r, yellow: y };
  }, [data]);

  return (
    <div className="coverage-summary">
      <span className="summary-chip chip-red">{red} critical cells (&lt;5)</span>
      <span className="summary-chip chip-yellow">{yellow} low cells (&lt;10)</span>
      <span className="summary-chip chip-legend">
        <span className="legend-dot dot-red"/>&lt;5
        <span className="legend-dot dot-yellow"/>&lt;10
        <span className="legend-dot dot-green"/>≥10
      </span>
      <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
        {total.toLocaleString()} total exercises
      </span>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export function ContentStatsPage({ canModerate }: Props) {
  const [data, setData] = useState<ContentStatsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canModerate) return;
    api.getContentStats()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load content stats.")
      );
  }, [canModerate]);

  if (!canModerate) return <div className="panel"><p>Access denied.</p></div>;
  if (error) return <div className="panel"><p className="error-text">{error}</p></div>;
  if (!data) return <div className="panel"><p>Loading content stats…</p></div>;

  return (
    <section className="content-stats-page">
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ marginBottom: 4 }}>Content Coverage</h2>
        <p className="stats-subtitle">
          Exercise counts by language, category, and CEFR level.
        </p>
      </div>

      <KpiCards data={data}/>

      <section className="charts-2col">
        <ChartCard title="Exercises per language" sub="Stacked by CEFR level">
          <LangStackedChart data={data}/>
        </ChartCard>
        <ChartCard title="Cell fill distribution" sub="How many cells hit each target">
          <GapDonut data={data}/>
        </ChartCard>
      </section>

      <ChartCard title="Exercises per category" sub="Total across all languages · dashed line = target (10 × languages)">
        <CategoryFillChart data={data}/>
      </ChartCard>

      <ChartCard
        title="Coverage grid"
        sub="Cell color = worst level in that cell. Click a cell to see exercise type breakdown."
      >
        <SummaryChips data={data}/>
        <CoverageGrid data={data}/>
      </ChartCard>
    </section>
  );
}
