import { useMemo, useState } from "react";
import type {
  CourseCategory,
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
  ProgressOverview,
  StatsData
} from "../types/course";

type StatsPageProps = {
  settings: LearnerSettings | null;
  progress: LearnerProgress | null;
  courseCategories: CourseCategory[];
  statsData: StatsData | null;
  progressOverview: ProgressOverview | null;
  languages: LanguageOption[];
  onNavigateToPractice: () => void;
};

function toTitleFromId(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8H12.5M9 4.5L12.5 8 9 11.5"/>
    </svg>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ActivityGrid({ history }: { history: Array<{ date: string; xp: number; sessions?: number }> }) {
  const [hover, setHover] = useState<{ xp: number; sessions: number; date: string } | null>(null);

  // weeks[w][d]: w = week index (oldest first), d = day-of-week (0=Mon … 6=Sun)
  // Covers from the Monday of the week containing 6 months ago through today's week.
  const { weeks, gridWeeks } = useMemo(() => {
    const localIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const byDate = new Map(history.map((d) => [d.date, d]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDow = (today.getDay() + 6) % 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - todayDow);

    const sixMonthsAgo = new Date(today);
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const startDow = (sixMonthsAgo.getDay() + 6) % 7;
    const gridStart = new Date(sixMonthsAgo);
    gridStart.setDate(sixMonthsAgo.getDate() - startDow);

    const gw = Math.round((thisMonday.getTime() - gridStart.getTime()) / (7 * 864e5)) + 1;

    const result: (typeof history[0] | null)[][] = [];
    for (let w = 0; w < gw; w++) {
      const week: (typeof history[0] | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const cell = new Date(gridStart);
        cell.setDate(gridStart.getDate() + w * 7 + d);
        if (cell > today) {
          week.push(null);
        } else {
          const iso = localIso(cell);
          week.push(byDate.get(iso) ?? { date: iso, xp: 0 });
        }
      }
      result.push(week);
    }
    return { weeks: result, gridWeeks: gw };
  }, [history]);

  const monthLabels = useMemo(() =>
    weeks.map((week, wi) => {
      const first = week.find((d) => d !== null);
      if (!first) return null;
      const m = new Date(first.date + "T00:00:00").getMonth();
      if (wi === 0) return MONTHS[m];
      const prevFirst = weeks[wi - 1].find((d) => d !== null);
      const prevM = prevFirst ? new Date(prevFirst.date + "T00:00:00").getMonth() : -1;
      return m !== prevM ? MONTHS[m] : null;
    }),
    [weeks]
  );

  const maxXp = useMemo(
    () => Math.max(...weeks.flat().map((d) => d?.xp ?? 0), 1),
    [weeks]
  );

  const tone = (xp: number | null) => {
    if (xp == null || xp === 0) return 0;
    if (xp < maxXp * 0.25) return 1;
    if (xp < maxXp * 0.5)  return 2;
    if (xp < maxXp * 0.75) return 3;
    return 4;
  };

  return (
    <div className="activity-grid-wrap">
      <div className="activity-head">
        <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>Daily practice · {gridWeeks} weeks</span>
      </div>
      <div className="activity-outer">
        {/* Month label row */}
        <div className="activity-month-row">
          <div className="activity-dow-spacer"/>
          {monthLabels.map((label, wi) => (
            <div key={wi} className="activity-month-cell">{label ?? ""}</div>
          ))}
        </div>
        {/* One row per day-of-week */}
        {DAY_LABELS.map((dayLabel, di) => (
          <div key={di} className="activity-day-row">
            <span className="activity-dow-label">{di % 2 === 0 ? dayLabel : ""}</span>
            {weeks.map((week, wi) => {
              const cell = week[di];
              return (
                <i
                  key={wi}
                  className={`act-cell tone-${cell ? tone(cell.xp) : 0}${cell == null ? " empty" : ""}`}
                  onMouseEnter={() => cell && setHover({ xp: cell.xp, sessions: cell.sessions ?? 0, date: cell.date })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="activity-footer">
        <div className="activity-tip">
          {hover ? (
            <span>
              <strong className="mono">{hover.xp} XP</strong>
              {hover.sessions ? ` · ${hover.sessions} session${hover.sessions === 1 ? "" : "s"}` : ""}
              {" · "}{new Date(hover.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </span>
          ) : (
            <span style={{ color: "var(--muted)" }}>Hover a cell for details</span>
          )}
        </div>
        <div className="activity-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((t) => (
            <i key={t} className={`act-cell tone-${t}`}/>
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

function SparkLine({ data }: { data: number[] }) {
  const path = useMemo(() => {
    if (!data.length) return "";
    const W = 120, H = 32;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [data]);

  return (
    <svg viewBox="0 0 120 32" width="120" height="32" className="kpi-spark" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function XpCurve({ data }: { data: Array<{ date: string; xp: number }> }) {
  const W = 600, H = 180, P = { l: 36, r: 12, t: 16, b: 28 };
  const max = Math.max(...data.map((d) => d.xp), 1) * 1.15;
  const xs = data.map((_, i) => P.l + (i / Math.max(data.length - 1, 1)) * (W - P.l - P.r));
  const ys = data.map((d) => H - P.b - (d.xp / max) * (H - P.t - P.b));
  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${H - P.b} L${xs[0].toFixed(1)},${H - P.b} Z`;
  const yTicks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <div className="chart-svg-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lf-xpFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => {
          const y = H - P.b - (v / max) * (H - P.t - P.b);
          return (
            <g key={i}>
              <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="var(--hairline)" strokeDasharray="2 4"/>
              <text x={P.l - 6} y={y + 3} className="chart-tick" textAnchor="end">{v}</text>
            </g>
          );
        })}
        {data.map((d, i) => i % Math.max(1, Math.floor(data.length / 5)) === 0 && (
          <text key={i} x={xs[i]} y={H - 8} className="chart-tick" textAnchor="middle">
            {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        ))}
        <path d={areaPath} fill="url(#lf-xpFill)"/>
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {data.map((d, i) => (
          <circle key={i} cx={xs[i]} cy={ys[i]} r="3" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.6"/>
        ))}
      </svg>
    </div>
  );
}

function SessionBars({ data }: { data: Array<{ date: string; sessions: number }> }) {
  const W = 600, H = 160, P = { l: 16, r: 16, t: 16, b: 32 };
  const max = Math.max(2, ...data.map((d) => d.sessions));
  const slot = (W - P.l - P.r) / Math.max(data.length, 1);

  return (
    <div className="chart-svg-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        {data.map((d, i) => {
          const cx = P.l + slot * (i + 0.5);
          const bw = Math.min(40, slot * 0.55);
          const bh = (d.sessions / max) * (H - P.t - P.b);
          const y = H - P.b - bh;
          const filled = d.sessions > 0;
          const label = new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })[0];
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={filled ? y : H - P.b - 2} width={bw} height={filled ? bh : 2} rx="3" fill={filled ? "var(--ink)" : "var(--hairline)"}/>
              <text x={cx} y={H - 10} className="chart-tick" textAnchor="middle">{label}</text>
              {filled && <text x={cx} y={y - 6} className="chart-num mono" textAnchor="middle">{d.sessions}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MasteryRail({ categories }: { categories: CourseCategory[] }) {
  const sorted = [...categories].sort((a, b) => b.mastery - a.mastery);
  return (
    <div className="rail-list">
      {sorted.map((c) => {
        const tone = c.mastery >= 80 ? "high" : c.mastery >= 60 ? "mid" : c.mastery >= 40 ? "low" : "none";
        return (
          <div key={c.id} className="rail-row">
            <span className="rail-label">{c.label}</span>
            <div className="rail-track">
              <div className={`rail-fill rail-${tone}`} style={{ width: `${c.mastery}%` }}/>
              <span className="rail-mark" style={{ left: "75%" }}/>
            </div>
            <span className="rail-num mono">{c.mastery.toFixed(0)}<small>%</small></span>
          </div>
        );
      })}
      <div className="rail-legend">
        <span><i className="rail-dot" style={{ background: "var(--good)" }}/> Mastered ≥75%</span>
        <span><i className="rail-dot" style={{ background: "var(--ink)" }}/> 60–74%</span>
        <span><i className="rail-dot" style={{ background: "var(--warn)" }}/> 40–59%</span>
        <span><i className="rail-dot" style={{ background: "var(--accent)" }}/> &lt;40%</span>
      </div>
    </div>
  );
}

function buildDonutArcs(data: Array<{ errorType: string; count: number }>, total: number, R: number, CX: number, CY: number) {
  return data.reduce<{ arcs: Array<{ d: string; e: typeof data[0] }>; cumulative: number }>(
    ({ arcs, cumulative }, e) => {
      const frac = e.count / total;
      const a0 = cumulative * Math.PI * 2 - Math.PI / 2;
      const a1 = (cumulative + frac) * Math.PI * 2 - Math.PI / 2;
      const large = frac > 0.5 ? 1 : 0;
      const x0 = CX + R * Math.cos(a0), y0 = CY + R * Math.sin(a0);
      const x1 = CX + R * Math.cos(a1), y1 = CY + R * Math.sin(a1);
      return {
        arcs: [...arcs, { d: `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`, e }],
        cumulative: cumulative + frac
      };
    },
    { arcs: [], cumulative: 0 }
  ).arcs;
}

function ErrorDonut({ data }: { data: Array<{ errorType: string; count: number }> }) {
  const total = data.reduce((s, e) => s + e.count, 0);
  if (!total) return null;
  const R = 56, S = 14, CX = 70, CY = 70;
  const arcs = buildDonutArcs(data, total, R, CX, CY);

  return (
    <div className="errors-layout">
      <div style={{ display: "grid", placeItems: "center" }}>
        <svg viewBox="0 0 140 140" width="140" height="140">
          {arcs.map((a, i) => (
            <path key={i} d={a.d} fill="none" stroke={`var(--err-${i % 5})`} strokeWidth={S}/>
          ))}
          <text x="70" y="68" className="donut-num" textAnchor="middle">{total}</text>
          <text x="70" y="82" className="donut-sub" textAnchor="middle">errors</text>
        </svg>
      </div>
      <ul className="errors-list-new">
        {data.map((e, i) => (
          <li key={e.errorType}>
            <span className="err-dot" style={{ background: `var(--err-${i % 5})` }}/>
            <span>{toTitleFromId(e.errorType)}</span>
            <div className="err-bar"><div className="err-bar-fill" style={{ width: `${(e.count / total) * 100}%`, background: `var(--err-${i % 5})` }}/></div>
            <span className="err-count">{e.count}</span>
            <span className="err-pct">{Math.round((e.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartCard({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
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

export function StatsPage({
  settings,
  progress,
  courseCategories,
  statsData,
  progressOverview,
  languages,
  onNavigateToPractice
}: StatsPageProps) {
  const dailyXpHistory = statsData?.dailyXpHistory || [];
  const sessionsByDay = (statsData?.sessionsByDay || []).slice(-7);
  const errorTypes = statsData?.errorTypeTrend || [];
  const weakObjectives = (statsData?.objectiveStats || []).slice(0, 4);

  const completionPercent = courseCategories.length
    ? Math.round(courseCategories.reduce((s, c) => s + c.mastery, 0) / courseCategories.length)
    : (statsData?.completionPercent ?? 0);
  const accuracyPercent = courseCategories.length
    ? Math.round(courseCategories.filter((c) => c.attempts > 0).reduce((s, c) => s + c.accuracy, 0) / Math.max(1, courseCategories.filter((c) => c.attempts > 0).length))
    : (statsData?.accuracyPercent ?? 0);
  const masteredCount = courseCategories.filter((c) => c.mastery >= 75).length;
  const streak = statsData?.streak ?? progress?.streak ?? 0;
  const weeklySessions = statsData?.sessionsLast7Days ?? 0;
  const weeklyTarget = statsData?.weeklyGoalSessions ?? settings?.weeklyGoalSessions ?? 5;
  const weeklyGoalProgress = statsData?.weeklyGoalProgress ?? Math.round((weeklySessions / weeklyTarget) * 100);

  const recentXp = dailyXpHistory.slice(-14);
  const totalXpRecent = recentXp.reduce((s, d) => s + d.xp, 0);
  const recentSessions = recentXp.reduce((s, d) => s + (("sessions" in d ? (d as any).sessions : 0) || 0), 0);

  const activeLanguageLabel = languages.find((l) => l.id === settings?.targetLanguage)?.label || "Language";

  const overviewLanguages = useMemo(() => {
    const overviewByLanguage = new Map(
      (progressOverview?.languages || []).map((e) => [String(e.language || "").trim().toLowerCase(), e] as const)
    );
    const selectableLanguages = languages.filter((l) => l.id !== settings?.nativeLanguage);
    return selectableLanguages.map((language) => {
      const raw = language.id.trim().toLowerCase();
      const fromOverview = overviewByLanguage.get(raw);
      return {
        key: raw,
        label: language.label || toTitleFromId(raw),
        totalXp: fromOverview?.totalXp ?? 0,
        streak: fromOverview?.streak ?? 0,
        active: raw === settings?.targetLanguage?.toLowerCase()
      };
    });
  }, [progressOverview?.languages, languages, settings?.nativeLanguage, settings?.targetLanguage]);

  const levelFromXp = (xp: number) => xp > 2000 ? "B2" : xp > 1200 ? "B1" : xp > 500 ? "A2" : "A1";

  return (
    <div className="stats-redesign">
      {/* Narrative hero */}
      <header className="stats-hero">
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
            Statistics · {activeLanguageLabel}
          </div>
          <h2 className="stats-hero-title">
            You&apos;ve practiced{" "}
            <span className="num-display">{recentSessions || weeklySessions * 2}</span>
            <span style={{ color: "var(--ink-soft)" }}> sessions recently,</span><br/>
            earning <span className="ink"><span className="num-display">{totalXpRecent.toLocaleString()}</span> XP</span>.
          </h2>
          <p className="stats-hero-sub">
            Track accuracy, consistency, and mastery across {courseCategories.length} categories.
          </p>
        </div>
        <div>
          <ActivityGrid history={dailyXpHistory}/>
        </div>
      </header>

      {/* KPI row */}
      <section className="kpi-grid">
        {[
          { label: "Completion", value: completionPercent, unit: "%", delta: "avg mastery", trend: "flat" as const, spark: dailyXpHistory.slice(-14).map((d) => d.xp) },
          { label: "Accuracy",   value: accuracyPercent,   unit: "%", delta: "practiced categories", trend: "flat" as const, spark: courseCategories.map((c) => c.accuracy) },
          { label: "Streak",     value: streak,            unit: " days", delta: "keep going!", trend: "up" as const, spark: Array.from({ length: 14 }, (_, i) => i + 1) },
          { label: "Mastered",   value: masteredCount,     unit: ` / ${courseCategories.length}`, delta: "categories ≥75%", trend: "flat" as const, spark: courseCategories.map((c) => c.mastery) }
        ].map((kpi) => (
          <article key={kpi.label} className="kpi-card">
            <div className="kpi-card-label">{kpi.label}</div>
            <div className="kpi-card-value">
              <span className="kpi-card-num">{kpi.value}</span>
              <span className="kpi-card-unit">{kpi.unit}</span>
            </div>
            <div className="kpi-card-foot">
              <span className={`kpi-delta delta-${kpi.trend}`}>
                {kpi.trend === "up" ? "↑ " : ""}{kpi.delta}
              </span>
              <span style={{ color: kpi.label === "Accuracy" ? "var(--accent)" : kpi.label === "Streak" ? "var(--streak-fg)" : "var(--ink)" }}>
                <SparkLine data={kpi.spark}/>
              </span>
            </div>
          </article>
        ))}
      </section>

      {/* Charts row */}
      {(dailyXpHistory.length > 0 || sessionsByDay.length > 0) && (
        <section className="charts-2col">
          <ChartCard title="XP earned" sub={`Last ${dailyXpHistory.length} days`} right={<span className="chart-card-meta">{totalXpRecent.toLocaleString()} XP</span>}>
            {dailyXpHistory.length > 0 ? <XpCurve data={dailyXpHistory}/> : <p style={{ color: "var(--muted)" }}>No data yet.</p>}
          </ChartCard>
          <ChartCard title="Sessions" sub="This week" right={<span className="chart-card-meta mono">{weeklySessions} / {weeklyTarget}</span>}>
            {sessionsByDay.length > 0 ? <SessionBars data={sessionsByDay}/> : <p style={{ color: "var(--muted)" }}>No data yet.</p>}
            <div className="goal-rail">
              <div className="goal-fill" style={{ width: `${Math.min(100, weeklyGoalProgress)}%` }}/>
              {Array.from({ length: weeklyTarget - 1 }).map((_, i) => (
                <span key={i} className="goal-tick" style={{ left: `${((i + 1) / weeklyTarget) * 100}%` }}/>
              ))}
            </div>
            <div className="goal-meta">
              <span>Weekly goal · {weeklyTarget} sessions</span>
              <span className="mono">{Math.min(100, weeklyGoalProgress)}%</span>
            </div>
          </ChartCard>
        </section>
      )}

      {/* Mastery rail */}
      {courseCategories.length > 0 && (
        <ChartCard title="Category mastery" sub={`${courseCategories.length} categories`} right={<span className="chart-card-meta">avg {completionPercent}%</span>}>
          <MasteryRail categories={courseCategories.filter((c) => c.unlocked)}/>
        </ChartCard>
      )}

      {/* Error breakdown + Focus next */}
      <section className="charts-2col">
        {errorTypes.length > 0 && (
          <ChartCard title="Where mistakes happen" sub="Error type breakdown" right={<span className="chart-card-meta mono">{errorTypes.reduce((s, e) => s + e.count, 0)} total</span>}>
            <ErrorDonut data={errorTypes}/>
          </ChartCard>
        )}

        {weakObjectives.length > 0 && (
          <ChartCard title="Focus next" sub="Lowest accuracy objectives">
            <ul className="weak-list-new">
              {weakObjectives.map((o, i) => (
                <li key={o.objective} className="weak-row-new">
                  <span className="weak-rank">{String(i + 1).padStart(2, "0")}</span>
                  <span className="weak-label">{toTitleFromId(o.objective)}</span>
                  <div className="weak-bar-new"><div className="weak-bar-fill-new" style={{ width: `${o.accuracy}%` }}/></div>
                  <span className="weak-pct-new">{o.accuracy}%</span>
                </li>
              ))}
            </ul>
            <button className="btn-primary-lg btn-wide" style={{ marginTop: 12 }} onClick={onNavigateToPractice}>
              Start focused drill <ArrowIcon/>
            </button>
          </ChartCard>
        )}
      </section>

      {/* Language table */}
      {overviewLanguages.length > 0 && (
        <ChartCard title="All course languages">
          <div className="lang-table-new">
            <div className="lang-row-new lang-head-row">
              <span>Language</span><span>Level</span><span>Total XP</span><span>Streak</span><span></span>
            </div>
            {overviewLanguages.map((l) => (
              <div key={l.key} className={`lang-row-new${l.active ? " active-lang" : ""}`}>
                <span className="lang-name-new">
                  {l.label}
                  {l.active && <em className="lang-pill">Active</em>}
                </span>
                <span className="mono">{levelFromXp(l.totalXp)}</span>
                <span className="mono">{l.totalXp.toLocaleString()}</span>
                <span className="mono">{l.streak} d</span>
                <span style={{ fontSize: "12.5px", color: "var(--accent)", fontWeight: 600 }}>
                  {l.active ? "Current" : "Switch"}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Category detail table */}
      {courseCategories.length > 0 && (
        <ChartCard title="Category detail" sub="Mastery, accuracy, attempts">
          <table className="cat-detail-table">
            <thead>
              <tr><th>Category</th><th>Level</th><th>Mastery</th><th>Accuracy</th><th>Attempts</th></tr>
            </thead>
            <tbody>
              {courseCategories.filter((c) => c.unlocked).map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.label}</strong></td>
                  <td><span className="lvl-pill">{c.levelUnlocked.toUpperCase()}</span></td>
                  <td>
                    <div className="cell-bar">
                      <div className="cell-bar-track"><div className="cell-bar-fill" style={{ width: `${c.mastery}%` }}/></div>
                      <span className="mono">{c.mastery.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="mono">{c.accuracy.toFixed(0)}%</td>
                  <td className="mono">{c.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      )}
    </div>
  );
}
