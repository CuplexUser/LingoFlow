export function StatsPage({ settings, progress, courseCategories, statsData }) {
  const totalCategoryCount = statsData?.categoryCount ?? courseCategories.length ?? 0;

  return (
    <section className="panel stats-panel">
      <h2>Statistics</h2>
      <p className="subtitle">Track completion, consistency, and category accuracy.</p>

      <div className="stats-grid">
        <article className="stat-card">
          <h3>% Completed</h3>
          <strong>{statsData?.completionPercent ?? 0}%</strong>
          <p>Based on average mastery across all categories.</p>
        </article>

        <article className="stat-card">
          <h3>Accuracy</h3>
          <strong>{statsData?.accuracyPercent ?? 0}%</strong>
          <p>Average of categories you have practiced.</p>
        </article>

        <article className="stat-card">
          <h3>Mastered Categories</h3>
          <strong>{statsData?.masteredCount ?? 0}/{totalCategoryCount}</strong>
          <p>Categories with at least 75% mastery.</p>
        </article>

        <article className="stat-card">
          <h3>Streak</h3>
          <strong>{statsData?.streak ?? progress?.streak ?? 0} days</strong>
          <p>{settings?.learnerName || "Learner"}, keep your rhythm strong.</p>
        </article>

        <article className="stat-card">
          <h3>Sessions (7 days)</h3>
          <strong>{statsData?.sessionsLast7Days ?? 0}</strong>
          <p>Weekly target: {statsData?.weeklyGoalSessions ?? 5}</p>
        </article>

        <article className="stat-card">
          <h3>Weekly Goal</h3>
          <strong>{statsData?.weeklyGoalProgress ?? 0}%</strong>
          <p>Progress toward your weekly session target.</p>
        </article>
      </div>

      {statsData?.weakestCategories?.length ? (
        <div className="setup-preview">
          <h3>Focus Next</h3>
          <p>Improve these categories next: {statsData.weakestCategories.join(", ")}.</p>
        </div>
      ) : null}
      {statsData?.objectiveStats?.length ? (
        <div className="setup-preview">
          <h3>Weak Objectives</h3>
          <p>
            {statsData.objectiveStats
              .slice(0, 3)
              .map((entry) => `${entry.objective} (${entry.accuracy}%)`)
              .join(", ")}
          </p>
        </div>
      ) : null}
      {statsData?.errorTypeTrend?.length ? (
        <div className="setup-preview">
          <h3>Recent Error Types</h3>
          <p>
            {statsData.errorTypeTrend
              .map((entry) => `${entry.errorType}: ${entry.count}`)
              .join(" | ")}
          </p>
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
