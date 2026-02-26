export function SetupPage({ languages, settings, draftSettings, onDraftChange, onSave, onReset }) {
  return (
    <section className="panel settings-panel">
      <h2>Learning Setup</h2>
      <p className="subtitle">Save your learner profile, goals, and language preferences.</p>
      <div className="settings-grid">
        <label>
          Your Name
          <input
            value={draftSettings.learnerName}
            maxLength={40}
            onChange={(event) => onDraftChange({ learnerName: event.target.value })}
            placeholder="Type your name"
          />
        </label>

        <label>
          Focus Area
          <input
            value={draftSettings.focusArea}
            maxLength={60}
            onChange={(event) => onDraftChange({ focusArea: event.target.value })}
            placeholder="Travel, grammar, speaking confidence..."
          />
        </label>

        <label>
          Native Language
          <select
            value={draftSettings.nativeLanguage}
            onChange={(event) => onDraftChange({ nativeLanguage: event.target.value })}
          >
            {languages.map((language) => (
              <option key={language.id} value={language.id}>{language.label}</option>
            ))}
          </select>
        </label>

        <label>
          Learning Language
          <select
            value={draftSettings.targetLanguage}
            onChange={(event) => onDraftChange({ targetLanguage: event.target.value })}
          >
            {languages.map((language) => (
              <option key={language.id} value={language.id}>{language.label}</option>
            ))}
          </select>
        </label>

        <label>
          Daily Goal (XP)
          <input
            type="number"
            min="20"
            max="500"
            value={draftSettings.dailyGoal}
            onChange={(event) => onDraftChange({ dailyGoal: Number(event.target.value) || 30 })}
          />
        </label>

        <label>
          Daily Study Time (minutes)
          <input
            type="number"
            min="5"
            max="240"
            value={draftSettings.dailyMinutes}
            onChange={(event) => onDraftChange({ dailyMinutes: Number(event.target.value) || 20 })}
          />
        </label>

        <label>
          Weekly Session Goal
          <input
            type="number"
            min="1"
            max="21"
            value={draftSettings.weeklyGoalSessions}
            onChange={(event) =>
              onDraftChange({ weeklyGoalSessions: Number(event.target.value) || 5 })
            }
          />
        </label>

        <label>
          Self-rated Level
          <select
            value={draftSettings.selfRatedLevel}
            onChange={(event) => onDraftChange({ selfRatedLevel: event.target.value })}
          >
            <option value="a1">A1 - Beginner</option>
            <option value="a2">A2 - Elementary</option>
            <option value="b1">B1 - Intermediate</option>
            <option value="b2">B2 - Upper Intermediate</option>
          </select>
        </label>

        <label className="wide-label">
          About You
          <textarea
            value={draftSettings.learnerBio}
            maxLength={220}
            onChange={(event) => onDraftChange({ learnerBio: event.target.value })}
            placeholder="Add your motivation, goals, and how often you want to practice."
          />
        </label>
      </div>

      <div className="setup-preview">
        <h3>Profile Preview</h3>
        <p><strong>{settings?.learnerName || "Learner"}</strong></p>
        <p>{settings?.learnerBio || "No profile details saved yet."}</p>
        <p>Level: {(settings?.selfRatedLevel || "a1").toUpperCase()}</p>
        <p>Plan: {settings?.dailyMinutes ?? 20} min/day, {settings?.weeklyGoalSessions ?? 5} sessions/week</p>
      </div>

      <div className="hero-actions">
        <button className="primary-button" onClick={onSave}>Save Setup</button>
        <button className="ghost-button" onClick={onReset}>Reset Draft</button>
      </div>
    </section>
  );
}
