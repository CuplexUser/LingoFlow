import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import {
  api,
  type AdminUser,
  type AdminUserSort,
  type AdminUserStats,
  type AdminUserStatsDay
} from "../api";

const PAGE_SIZE = 50;
const RANGES = [30, 90, 365];
const SORTS: Array<{ id: AdminUserSort; label: string }> = [
  { id: "created", label: "Newest first" },
  { id: "active", label: "Recently active" },
  { id: "logins", label: "Most sign-ins" },
  { id: "xp", label: "Most XP" }
];

function formatNumber(value: number): string {
  return value.toLocaleString(navigator.language);
}

// Day strings ("YYYY-MM-DD") are UTC days from the server; show them as that calendar day.
function formatDay(day: string | null, withYear = true): string {
  if (!day) return "—";
  return new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString(navigator.language, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {})
  });
}

// "YYYY-MM-DD" in local time, as a date input expects.
function localIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(navigator.language, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function AdminUsersPanel() {
  const [days, setDays] = useState(90);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [statsError, setStatsError] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminUserSort>("created");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  async function loadStats(range = days) {
    try {
      setStats(await api.getAdminUserStats(range));
      setStatsError("");
    } catch (error: unknown) {
      setStatsError(error instanceof Error ? error.message : "Could not load user stats.");
    }
  }

  async function loadUsers({ offset = 0, limit = PAGE_SIZE } = {}) {
    setUsersLoading(true);
    try {
      const result = await api.getAdminUsers({ search: query, sort, limit, offset });
      setUsers((previous) => (offset ? [...previous, ...result.users] : result.users));
      setTotal(result.total);
      setUsersError("");
    } catch (error: unknown) {
      setUsersError(error instanceof Error ? error.message : "Could not load users.");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    loadStats(days);
  }, [days]);

  // Wait for a pause in typing before searching.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [query, sort]);

  // After a grant or revoke, refresh the rows already on screen and the Premium count.
  async function handlePremiumChanged() {
    await Promise.all([loadUsers({ limit: Math.max(PAGE_SIZE, users.length) }), loadStats()]);
  }

  return (
    <section className="admin-users">
      <div className="admin-users-head">
        <div>
          <h2>Users</h2>
          <p className="stats-subtitle">
            Registrations, activity and Premium access. Days are UTC.
          </p>
        </div>
        <div className="admin-range" role="group" aria-label="Time range">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              className={`admin-range-btn${days === range ? " active" : ""}`}
              aria-pressed={days === range}
              onClick={() => setDays(range)}
            >
              {range === 365 ? "1 year" : `${range} days`}
            </button>
          ))}
        </div>
      </div>

      {statsError ? <p className="rebuild-error">{statsError}</p> : null}
      {stats ? <UserStatsView stats={stats} /> : statsError ? null : <p>Loading user stats…</p>}

      <ChartCard
        title="All users"
        sub="Activity counts days with at least one signed-in request"
        right={<span className="chart-card-meta">{formatNumber(total)} {query ? "matching" : "total"}</span>}
      >
        <div className="admin-users-filters">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email or name"
            aria-label="Search users"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as AdminUserSort)}
            aria-label="Sort users"
          >
            {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        {usersError ? <p className="rebuild-error">{usersError}</p> : null}
        <UserTable users={users} onPremiumChanged={handlePremiumChanged} />
        {!usersLoading && !users.length && !usersError ? (
          <p className="stats-subtitle">No users found.</p>
        ) : null}
        {users.length < total ? (
          <div className="hero-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={usersLoading}
              onClick={() => loadUsers({ offset: users.length })}
            >
              {usersLoading ? "Loading…" : `Show more (${formatNumber(total - users.length)} left)`}
            </button>
          </div>
        ) : null}
      </ChartCard>
    </section>
  );
}

// ── stats ─────────────────────────────────────────────────────────────────────

function UserStatsView({ stats }: { stats: AdminUserStats }) {
  const { totals, active, logins, daily } = stats;
  const windowStart = daily[0]?.date || null;
  const trackingStartsLate = Boolean(
    stats.trackingSince && windowStart && stats.trackingSince > windowStart
  );
  const signupsInWindow = daily.reduce((sum, day) => sum + day.signups, 0);

  const kpis = [
    {
      label: "Registered users",
      value: formatNumber(totals.users),
      foot: `+${formatNumber(totals.newLast7Days)} this week · +${formatNumber(totals.newLast30Days)} in 30 days`
    },
    {
      label: "Active today",
      value: formatNumber(active.today),
      foot: `${formatNumber(active.last7Days)} in 7 days · ${formatNumber(active.last30Days)} in 30 days`
    },
    {
      label: "Premium",
      value: formatNumber(totals.premiumSubscriptions + totals.premiumGrants),
      foot: `${formatNumber(totals.premiumSubscriptions)} subscribed · ${formatNumber(totals.premiumGrants)} granted`
    },
    {
      label: "Sign-ins, 30 days",
      value: formatNumber(logins.last30Days),
      foot: `${formatNumber(logins.usersLast30Days)} users · ${formatNumber(logins.last7Days)} this week`
    }
  ];

  return (
    <>
      <section className="kpi-grid">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="kpi-card">
            <div className="kpi-card-label">{kpi.label}</div>
            <div className="kpi-card-value">
              <span className="kpi-card-num">{kpi.value}</span>
            </div>
            <div className="kpi-card-foot">
              <span className="kpi-delta delta-flat">{kpi.foot}</span>
            </div>
          </article>
        ))}
      </section>

      {trackingStartsLate ? (
        <p className="stats-subtitle">
          Activity and sign-ins are recorded from {formatDay(stats.trackingSince)}; earlier days show none.
        </p>
      ) : null}

      <section className="charts-2col">
        <ChartCard
          title="Registered users"
          sub={`Total accounts, last ${stats.days} days`}
          right={<span className="chart-card-meta">+{formatNumber(signupsInWindow)}</span>}
        >
          <GrowthChart data={daily} />
        </ChartCard>
        <ChartCard
          title="Daily active users"
          sub="Distinct users per day, by app"
          right={
            <span className="chart-card-meta">
              {formatNumber(active.last30DaysWeb)} web · {formatNumber(active.last30DaysAndroid)} Android (30 days)
            </span>
          }
        >
          <ActiveUsersChart data={daily} />
        </ChartCard>
      </section>

      <details className="admin-daily-table">
        <summary>Daily numbers</summary>
        <div className="coverage-grid-wrap">
          <table className="coverage-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>New users</th>
                <th>Total users</th>
                <th>Active</th>
                <th>Web</th>
                <th>Android</th>
                <th>Sign-ins</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((day) => (
                <tr key={day.date}>
                  <td>{formatDay(day.date)}</td>
                  <td>{day.signups}</td>
                  <td>{day.totalUsers}</td>
                  <td>{day.activeUsers}</td>
                  <td>{day.activeWeb}</td>
                  <td>{day.activeAndroid}</td>
                  <td>{day.logins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

const CHART_W = 600;
const CHART_H = 200;
const PAD = { l: 40, r: 12, t: 14, b: 26 };

// Returns the index of the day under the pointer, and where to place the tooltip.
function useHoveredDay(count: number) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{ index: number; left: number; top: number } | null>(null);

  function onMouseMove(event: MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !count) return;
    const x = ((event.clientX - rect.left) / rect.width) * CHART_W;
    const slot = (CHART_W - PAD.l - PAD.r) / count;
    const index = Math.min(count - 1, Math.max(0, Math.floor((x - PAD.l) / slot)));
    setHovered({ index, left: event.clientX - rect.left, top: event.clientY - rect.top });
  }

  return { svgRef, hovered, onMouseMove, onMouseLeave: () => setHovered(null) };
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value / 4) || 10;
  return Math.ceil(value / (step * magnitude)) * step * magnitude;
}

function AxisFrame({ max, data }: { max: number; data: AdminUserStatsDay[] }) {
  const ticks = [0, 0.5, 1].map((fraction) => Math.round(max * fraction));
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));
  const slot = (CHART_W - PAD.l - PAD.r) / Math.max(data.length, 1);
  return (
    <>
      {ticks.map((tick) => {
        const y = CHART_H - PAD.b - (tick / max) * (CHART_H - PAD.t - PAD.b);
        return (
          <g key={tick}>
            <line x1={PAD.l} x2={CHART_W - PAD.r} y1={y} y2={y} stroke="var(--hairline)" strokeDasharray="2 4" />
            <text x={PAD.l - 6} y={y + 3} className="chart-tick" textAnchor="end">{formatNumber(tick)}</text>
          </g>
        );
      })}
      {data.map((day, index) => (index % labelEvery === 0 ? (
        <text key={day.date} x={PAD.l + slot * (index + 0.5)} y={CHART_H - 8} className="chart-tick" textAnchor="middle">
          {formatDay(day.date, false)}
        </text>
      ) : null))}
    </>
  );
}

function ChartTooltip({ left, top, children }: { left: number; top: number; children: ReactNode }) {
  return <div className="admin-chart-tooltip" style={{ left, top }}>{children}</div>;
}

function GrowthChart({ data }: { data: AdminUserStatsDay[] }) {
  const { svgRef, hovered, onMouseMove, onMouseLeave } = useHoveredDay(data.length);
  if (!data.length) return null;
  const max = niceMax(Math.max(...data.map((day) => day.totalUsers), 1));
  const slot = (CHART_W - PAD.l - PAD.r) / data.length;
  const xs = data.map((_, index) => PAD.l + slot * (index + 0.5));
  const ys = data.map((day) => CHART_H - PAD.b - (day.totalUsers / max) * (CHART_H - PAD.t - PAD.b));
  const line = xs.map((x, index) => `${index ? "L" : "M"}${x.toFixed(1)},${ys[index].toFixed(1)}`).join(" ");
  const area = `${line} L${xs[xs.length - 1].toFixed(1)},${CHART_H - PAD.b} L${xs[0].toFixed(1)},${CHART_H - PAD.b} Z`;
  const tip = hovered ? data[hovered.index] : null;
  const last = data[data.length - 1];

  return (
    <div className="chart-svg-wrap admin-chart">
      {tip && hovered ? (
        <ChartTooltip left={hovered.left} top={hovered.top}>
          <strong>{formatNumber(tip.totalUsers)} users</strong>
          <span>{tip.signups ? `+${formatNumber(tip.signups)} that day` : "No sign-ups"}</span>
          <span className="admin-chart-tooltip-date">{formatDay(tip.date)}</span>
        </ChartTooltip>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        role="img"
        aria-label={`Registered users grew to ${last.totalUsers} by ${formatDay(last.date)}`}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <defs>
          <linearGradient id="lf-userGrowthFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <AxisFrame max={max} data={data} />
        <path d={area} fill="url(#lf-userGrowthFill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hovered ? (
          <>
            <line
              x1={xs[hovered.index]}
              x2={xs[hovered.index]}
              y1={PAD.t}
              y2={CHART_H - PAD.b}
              stroke="var(--hairline-2)"
            />
            <circle
              cx={xs[hovered.index]}
              cy={ys[hovered.index]}
              r="4.5"
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function ActiveUsersChart({ data }: { data: AdminUserStatsDay[] }) {
  const { svgRef, hovered, onMouseMove, onMouseLeave } = useHoveredDay(data.length);
  if (!data.length) return null;
  const max = niceMax(Math.max(...data.map((day) => day.activeWeb + day.activeAndroid), 1));
  const plotH = CHART_H - PAD.t - PAD.b;
  const slot = (CHART_W - PAD.l - PAD.r) / data.length;
  // Leave a 2px gap between bars and stacked segments while there is room for one.
  const gap = slot >= 6 ? 2 : 0;
  const barW = Math.max(1, Math.min(24, slot - gap));
  const tip = hovered ? data[hovered.index] : null;
  const peak = Math.max(...data.map((day) => day.activeUsers));

  return (
    <div className="chart-svg-wrap admin-chart">
      <div className="admin-chart-legend">
        <span><i className="admin-swatch series-web" />Web</span>
        <span><i className="admin-swatch series-android" />Android</span>
      </div>
      {tip && hovered ? (
        <ChartTooltip left={hovered.left} top={hovered.top}>
          <strong>{formatNumber(tip.activeUsers)} active</strong>
          <span><i className="admin-swatch series-web" />Web {formatNumber(tip.activeWeb)}</span>
          <span><i className="admin-swatch series-android" />Android {formatNumber(tip.activeAndroid)}</span>
          <span className="admin-chart-tooltip-date">{formatDay(tip.date)}</span>
        </ChartTooltip>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        role="img"
        aria-label={`Daily active users, peaking at ${peak}`}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <AxisFrame max={max} data={data} />
        {data.map((day, index) => {
          const x = PAD.l + slot * index + (slot - barW) / 2;
          const webH = (day.activeWeb / max) * plotH;
          const androidH = (day.activeAndroid / max) * plotH;
          const webY = CHART_H - PAD.b - webH;
          const androidY = webY - androidH - (webH && androidH ? gap : 0);
          return (
            <g key={day.date} opacity={hovered && hovered.index !== index ? 0.55 : 1}>
              {webH ? <rect className="series-web" x={x} y={webY} width={barW} height={webH} rx={Math.min(2, barW / 2)} /> : null}
              {androidH ? (
                <rect className="series-android" x={x} y={androidY} width={barW} height={androidH} rx={Math.min(2, barW / 2)} />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── user table ────────────────────────────────────────────────────────────────

function UserTable({ users, onPremiumChanged }: { users: AdminUser[]; onPremiumChanged: () => Promise<void> }) {
  if (!users.length) return null;
  return (
    <div className="coverage-grid-wrap">
      <table className="coverage-table admin-user-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Joined</th>
            <th>Last active</th>
            <th title="Days with activity in the last 30 days">Active days</th>
            <th>Sign-ins</th>
            <th>XP</th>
            <th>Premium</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <strong>{user.displayName}</strong>
                <div className="admin-user-email">{user.email}</div>
                <div className="admin-user-meta">
                  {user.authProvider === "google" ? "Google" : "Password"}
                  {user.emailVerified ? "" : " · unverified"}
                </div>
              </td>
              <td>{formatTimestamp(user.createdAt)}</td>
              <td>{formatDay(user.lastActiveDay)}</td>
              <td>{user.activeDays30}</td>
              <td>
                {user.loginCount}
                {user.lastLoginAt ? <div className="admin-user-meta">last {formatTimestamp(user.lastLoginAt)}</div> : null}
              </td>
              <td>{formatNumber(user.totalXp)}</td>
              <td><PremiumCell user={user} onChanged={onPremiumChanged} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PremiumCell({ user, onChanged }: { user: AdminUser; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<"idle" | "granting" | "revoking">("idle");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = localIsoDate(new Date());

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setMode("idle");
      setExpiresOn("");
      setNote("");
      await onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update Premium.");
    } finally {
      setBusy(false);
    }
  }

  function handleGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The grant lasts through the end of the chosen day in the admin's time zone.
    const expiresAt = expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null;
    run(() => api.grantPremium(user.id, { expiresAt, note: note.trim() }));
  }

  return (
    <div className="admin-premium">
      {user.subscription ? (
        <span className="admin-badge">
          Subscribed{user.subscription.expiresAt ? ` · until ${formatTimestamp(user.subscription.expiresAt)}` : ""}
        </span>
      ) : null}
      {user.grant ? (
        <span className="admin-badge" title={user.grant.note || undefined}>
          Granted · {user.grant.expiresAt ? `until ${formatTimestamp(user.grant.expiresAt)}` : "no end date"}
        </span>
      ) : null}
      {user.grant?.note ? <div className="admin-user-meta">{user.grant.note}</div> : null}
      {user.onPremiumAccountList ? <span className="admin-badge">Account list</span> : null}
      {!user.subscription && !user.grant && !user.onPremiumAccountList ? (
        <span className="admin-user-meta">Free</span>
      ) : null}

      {mode === "granting" ? (
        <form className="admin-grant-form" onSubmit={handleGrant}>
          <label>
            Until (optional)
            <input
              type="date"
              value={expiresOn}
              min={today}
              onChange={(event) => setExpiresOn(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Note
            <input
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Beta tester, support case…"
              disabled={busy}
            />
          </label>
          <div className="admin-premium-actions">
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? "Saving…" : user.grant ? "Update grant" : "Grant Premium"}
            </button>
            <button type="button" className="ghost-button" disabled={busy} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </form>
      ) : mode === "revoking" ? (
        <div className="admin-premium-actions">
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => run(() => api.revokePremium(user.id))}
          >
            {busy ? "Revoking…" : "Confirm revoke"}
          </button>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => setMode("idle")}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="admin-premium-actions">
          <button type="button" className="ghost-button" onClick={() => setMode("granting")}>
            {user.grant ? "Edit grant" : "Grant Premium"}
          </button>
          {user.grant ? (
            <button type="button" className="ghost-button" onClick={() => setMode("revoking")}>
              Revoke
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="rebuild-error">{error}</p> : null}
    </div>
  );
}

function ChartCard({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
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
