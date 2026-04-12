import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Tooltip
} from "chart.js";
import { useMemo } from "react";
import { Bar, Doughnut, Line, Radar } from "react-chartjs-2";
import type {
  CourseCategory,
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
  ProgressOverview,
  StatsData
} from "../types/course";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

type StatsPageProps = {
  activeTheme: "light" | "dark";
  settings: LearnerSettings | null;
  progress: LearnerProgress | null;
  courseCategories: CourseCategory[];
  statsData: StatsData | null;
  progressOverview: ProgressOverview | null;
  languages: LanguageOption[];
};

function formatShortDateLabel(isoDate: string): string {
  const asDate = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(asDate.getTime())) return isoDate;
  return asDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function toTitleFromId(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getThemeChartColors(activeTheme: "light" | "dark") {
  const inDarkMode = activeTheme === "dark";

  return {
    text: inDarkMode ? "#b5b2ad" : "#66635f",
    line: inDarkMode ? "#4d5564" : "#dfddda",
    bar: inDarkMode ? "rgba(148, 163, 184, 0.9)" : "rgba(87, 83, 78, 0.85)",
    lineStroke: inDarkMode ? "#93c5fd" : "#2563eb",
    fill: inDarkMode ? "rgba(37, 99, 235, 0.16)" : "rgba(37, 99, 235, 0.1)",
    accentBlue: inDarkMode ? "#93c5fd" : "#2563eb",
    accentAmber: inDarkMode ? "#fbbf24" : "#d97706",
    accentGreen: inDarkMode ? "#4ade80" : "#16a34a",
    accentRed: inDarkMode ? "#f87171" : "#dc2626"
  };
}

export function StatsPage({
  activeTheme,
  settings,
  progress,
  courseCategories,
  statsData,
  progressOverview,
  languages
}: StatsPageProps) {
  const totalCategoryCount = courseCategories.length || statsData?.categoryCount || 0;
  const dailyXpHistory = (statsData?.dailyXpHistory || []).slice(-14);
  const sessionsByDay = (statsData?.sessionsByDay || []).slice(-7);
  const completionPercent = courseCategories.length
    ? Math.round(courseCategories.reduce((sum, category) => sum + category.mastery, 0) / courseCategories.length)
    : (statsData?.completionPercent ?? 0);
  const accuracyPercent = courseCategories.length
    ? Math.round(courseCategories.reduce((sum, category) => sum + category.accuracy, 0) / courseCategories.length)
    : (statsData?.accuracyPercent ?? 0);
  const masteredCount = courseCategories.length
    ? courseCategories.filter((category) => category.mastery >= 75).length
    : (statsData?.masteredCount ?? 0);
  const weeklyGoalProgress = statsData?.weeklyGoalProgress ?? 0;
  const chartColors = getThemeChartColors(activeTheme);
  const activeLanguageLabel = languages.find((item) => item.id === settings?.targetLanguage)?.label || "Language";

  const xpChartLabels = useMemo(
    () => dailyXpHistory.map((entry) => formatShortDateLabel(entry.date)),
    [dailyXpHistory]
  );

  const xpLineData = useMemo(() => ({
    labels: xpChartLabels,
    datasets: [
      {
        label: "XP",
        data: dailyXpHistory.map((entry) => entry.xp),
        borderColor: chartColors.lineStroke,
        borderWidth: 2,
        fill: true,
        backgroundColor: chartColors.fill,
        tension: 0.35,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointBackgroundColor: chartColors.lineStroke,
        pointBorderWidth: 0
      }
    ]
  }), [xpChartLabels, dailyXpHistory, chartColors.lineStroke, chartColors.fill]);

  const weekBarData = useMemo(() => ({
    labels: sessionsByDay.map((entry) => formatShortDateLabel(entry.date)),
    datasets: [
      {
        label: "Sessions",
        data: sessionsByDay.map((entry) => entry.sessions),
        backgroundColor: sessionsByDay.map((entry) =>
          entry.sessions > 0 ? chartColors.bar : chartColors.line
        ),
        borderRadius: 6,
        borderSkipped: false
      }
    ]
  }), [sessionsByDay, chartColors.bar, chartColors.line]);

  const categoryForCharts = useMemo(() => {
    const statsByCategory = new Map(
      (statsData?.categoryStats || []).map((entry) => [entry.category, entry])
    );
    return courseCategories
      .map((category) => {
        const fromStats = statsByCategory.get(category.id);
        return {
          category: category.id,
          sessions: fromStats?.sessions ?? category.attempts ?? 0,
          accuracy: Number.isFinite(category.accuracy) ? category.accuracy : (fromStats?.accuracy ?? 0),
          label: category.label || toTitleFromId(category.id)
        };
      })
      .filter((entry) => Number.isFinite(entry.accuracy))
      .sort((left, right) => right.accuracy - left.accuracy);
  }, [statsData, courseCategories]);

  const radarData = useMemo(() => ({
    labels: categoryForCharts.map((entry) => entry.label),
    datasets: [
      {
        label: "Accuracy",
        data: categoryForCharts.map((entry) => entry.accuracy),
        borderColor: chartColors.accentBlue,
        backgroundColor: `${chartColors.accentBlue}33`,
        borderWidth: 2,
        pointBackgroundColor: chartColors.accentBlue,
        pointRadius: 2.5
      }
    ]
  }), [categoryForCharts, chartColors.accentBlue]);

  const errorTypeColors = [
    chartColors.accentBlue,
    chartColors.accentAmber,
    chartColors.accentRed,
    chartColors.accentGreen,
    chartColors.lineStroke,
    chartColors.bar
  ];

  const errorData = useMemo(() => ({
    labels: (statsData?.errorTypeTrend || []).map((entry) => toTitleFromId(entry.errorType)),
    datasets: [
      {
        data: (statsData?.errorTypeTrend || []).map((entry) => entry.count),
        backgroundColor: (statsData?.errorTypeTrend || []).map((_, index) =>
          errorTypeColors[index % errorTypeColors.length]
        ),
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  }), [statsData?.errorTypeTrend, errorTypeColors]);

  const commonOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { intersect: false, mode: "index" as const }
    },
    scales: {
      x: {
        ticks: { color: chartColors.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
        grid: { color: chartColors.line }
      },
      y: {
        beginAtZero: true,
        ticks: { color: chartColors.text, precision: 0 },
        grid: { color: chartColors.line }
      }
    }
  }), [chartColors.text, chartColors.line]);

  const weeklySessions = statsData?.sessionsLast7Days ?? 0;
  const weeklyTarget = statsData?.weeklyGoalSessions ?? 5;
  const weakObjectives = (statsData?.objectiveStats || []).slice(0, 4);
  const overviewLanguages = useMemo(() => {
    const overviewByLanguage = new Map(
      (progressOverview?.languages || [])
        .map((entry) => [String(entry.language || "").trim().toLowerCase(), entry] as const)
        .filter(([languageId]) => Boolean(languageId))
    );
    const knownLanguageIds = new Set(languages.map((item) => item.id));
    const selectableLanguages = languages.filter((item) => item.id !== settings?.nativeLanguage);
    return selectableLanguages
      .map((language) => {
        const rawLanguage = String(language.id || "").trim().toLowerCase();
        if (!rawLanguage) return null;
        if (/^\d+$/.test(rawLanguage) && !knownLanguageIds.has(rawLanguage)) return null;
        const fromOverview = overviewByLanguage.get(rawLanguage);
        return {
          key: rawLanguage,
          label: language.label || toTitleFromId(rawLanguage),
          totalXp: fromOverview?.totalXp ?? 0,
          streak: fromOverview?.streak ?? 0
        };
      })
      .filter((entry): entry is { key: string; label: string; totalXp: number; streak: number } => Boolean(entry));
  }, [progressOverview?.languages, languages, settings?.nativeLanguage]);
  const chartThemeKey = activeTheme;
  const barOptions = useMemo(() => ({
    ...commonOptions,
    scales: {
      x: {
        ticks: { color: chartColors.text, maxRotation: 0, autoSkip: false, maxTicksLimit: 7 },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: { color: chartColors.text, precision: 0, stepSize: 1 },
        grid: { color: chartColors.line }
      }
    }
  }), [commonOptions, chartColors.text, chartColors.line]);

  return (
    <section className="panel stats-panel stats-root">
      <div className="stats-header">
        <h2>Statistics</h2>
        <p>{activeLanguageLabel} · Track your accuracy, consistency, and progress across all categories.</p>
      </div>

      <div className="kpi-row">
        <article className="kpi">
          <div className="kpi-label">Completion</div>
          <div className="kpi-value blue">{completionPercent}%</div>
          <div className="kpi-sub">avg mastery, all categories</div>
        </article>

        <article className="kpi">
          <div className="kpi-label">Accuracy</div>
          <div className="kpi-value green">{accuracyPercent}%</div>
          <div className="kpi-sub">across practiced categories</div>
        </article>

        <article className="kpi">
          <div className="kpi-label">Streak</div>
          <div className="kpi-value amber">{statsData?.streak ?? progress?.streak ?? 0} days</div>
          <div className="kpi-sub">{settings?.learnerName || "Learner"}, keep your rhythm strong</div>
        </article>

        <article className="kpi">
          <div className="kpi-label">Mastered</div>
          <div className="kpi-value">{masteredCount}/{totalCategoryCount}</div>
          <div className="kpi-sub">categories &gt;= 75% mastery</div>
        </article>
      </div>

      {dailyXpHistory.length || sessionsByDay.length ? (
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-title">XP - last 14 days</div>
            <div className="chart-wrap">
              <Line key={`xp-${chartThemeKey}`} data={xpLineData} options={commonOptions} />
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Sessions this week</div>
            <div className="chart-wrap">
              <Bar key={`sessions-${chartThemeKey}`} data={weekBarData} options={barOptions} />
            </div>
          </div>
        </div>
      ) : null}

      {courseCategories.length ? (
        <div className="chart-card chart-card-spacing">
          <div className="chart-title">Category mastery</div>
          <div className="mastery-list">
            {courseCategories
              .slice()
              .sort((left, right) => right.mastery - left.mastery)
              .map((category) => (
                <div key={category.id} className="mastery-row">
                  <span className="mastery-label">{category.label}</span>
                  <div className="mastery-bar-wrap">
                    <div
                      className="mastery-bar"
                      style={{
                        width: `${Math.max(2, category.mastery)}%`,
                        background: category.mastery >= 80
                          ? chartColors.accentGreen
                          : category.mastery >= 60
                            ? chartColors.accentBlue
                            : category.mastery >= 40
                              ? chartColors.accentAmber
                              : chartColors.accentRed
                      }}
                    />
                  </div>
                  <span className="mastery-pct">{category.mastery.toFixed(0)}%</span>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      {(categoryForCharts.length || statsData?.errorTypeTrend?.length) ? (
        <div className="charts-grid">
          <div className="chart-card">
            <div className="chart-title">Accuracy by category</div>
            <div className="chart-wrap">
              <Radar
                key={`radar-${chartThemeKey}`}
                data={radarData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    r: {
                      min: 0,
                      max: 100,
                      ticks: { color: chartColors.text, stepSize: 25, backdropColor: "transparent" },
                      grid: { color: chartColors.line },
                      angleLines: { color: chartColors.line },
                      pointLabels: { color: chartColors.text }
                    }
                  }
                }}
              />
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Error type breakdown</div>
            <div className="chart-wrap">
              <Doughnut
                key={`error-${chartThemeKey}`}
                data={errorData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "62%",
                  plugins: {
                    legend: {
                      position: "right" as const,
                      labels: {
                        color: chartColors.text,
                        boxWidth: 10,
                        padding: 8
                      }
                    }
                  }
                }}
              />
            </div>
            {statsData?.errorTypeTrend?.length ? (
              <div className="error-pill-list">
                {statsData.errorTypeTrend.map((entry, index) => (
                  <div className="error-pill" key={entry.errorType}>
                    <span
                      className="error-pill-dot"
                      style={{ backgroundColor: errorTypeColors[index % errorTypeColors.length] }}
                    />
                    <span className="error-pill-label">{toTitleFromId(entry.errorType)}</span>
                    <span className="error-pill-count">{entry.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="bottom-grid">
        <div className="chart-card">
          <div className="chart-title">Weak objectives</div>
          {weakObjectives.length ? (
            <div className="weak-list">
              {weakObjectives.map((entry) => (
                <div className="weak-row" key={entry.objective}>
                  <span className="weak-row-left">{toTitleFromId(entry.objective)}</span>
                  <strong className="weak-row-right">{entry.accuracy}% acc</strong>
                </div>
              ))}
            </div>
          ) : (
            <p>No objective data yet.</p>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Weekly goal</div>
          <div className="weekly-wrap">
            <div className="weekly-leading">
              <strong>{weeklySessions}/{weeklyTarget}</strong>
              sessions completed this week
            </div>
            <div className="weekly-bar-outer" aria-hidden="true">
              <div className="weekly-bar-inner" style={{ width: `${weeklyGoalProgress}%` }} />
            </div>
            <div className="weekly-meta">
              <span>Goal: {weeklyTarget} sessions</span>
              <strong>{weeklyGoalProgress >= 100 ? "Goal reached" : `${weeklyGoalProgress}% there`}</strong>
            </div>
          </div>
        </div>
      </div>

      {statsData?.weakestCategories?.length ? (
        <div className="setup-preview">
          <h3>Focus Next</h3>
          <p>
            Improve these categories next: {
              statsData.weakestCategories
                .map((categoryId) => courseCategories.find((entry) => entry.id === categoryId)?.label || toTitleFromId(categoryId))
                .join(", ")
            }.
          </p>
        </div>
      ) : null}

      {overviewLanguages.length ? (
        <div className="chart-card chart-card-spacing">
          <div className="chart-title">All course languages</div>
          {overviewLanguages.map((entry) => (
            <div className="lang-row" key={entry.key}>
              <span className="lang-name">{entry.label}</span>
              <span className="lang-xp">{entry.totalXp} XP</span>
              <span className="lang-streak">{entry.streak} day streak</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="category-table-wrap">
        <table className="category-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Mastery</th>
              <th>Accuracy</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {courseCategories.map((category) => (
              <tr key={category.id}>
                <td>{category.label}</td>
                <td>{category.mastery.toFixed(1)}%</td>
                <td>{category.accuracy.toFixed(1)}%</td>
                <td>{category.levelUnlocked.toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
