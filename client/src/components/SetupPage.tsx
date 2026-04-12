import { useState, type ChangeEvent } from "react";
import type { LanguageOption, LearnerSettings } from "../types/course";

type SetupPageProps = {
  languages: LanguageOption[];
  settings: LearnerSettings | null;
  draftSettings: LearnerSettings;
  authProvider?: string;
  onDraftChange: (patch: Partial<LearnerSettings>) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  onDeleteAccount: (payload: { password: string; confirmDelete: boolean }) => Promise<void>;
};

export function SetupPage({
  languages,
  settings,
  draftSettings,
  authProvider,
  onDraftChange,
  onSave,
  onReset,
  onDeleteAccount
}: SetupPageProps) {
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const learningLanguages = languages.filter(
    (language) => language.id !== draftSettings.nativeLanguage
  );
  const canDeleteInApp = authProvider === "local";

  function handleNumberChange(
    key: "dailyGoal" | "dailyMinutes" | "weeklyGoalSessions",
    fallback: number
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onDraftChange({ [key]: Number(event.target.value) || fallback });
    };
  }

  async function handleDeleteAccount() {
    if (!canDeleteInApp) return;
    if (!deleteConfirmed || !deletePassword) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await onDeleteAccount({
        password: deletePassword,
        confirmDelete: true
      });
    } catch (error: unknown) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete account.");
      setDeleteBusy(false);
    }
  }

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
            onChange={(event) => {
              const nextNative = event.target.value;
              const patch: Partial<LearnerSettings> = { nativeLanguage: nextNative };
              if (draftSettings.targetLanguage === nextNative) {
                const fallbackTarget = languages.find((language) => language.id !== nextNative)?.id || "";
                if (fallbackTarget) {
                  patch.targetLanguage = fallbackTarget;
                }
              }
              onDraftChange(patch);
            }}
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
            {learningLanguages.map((language) => (
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
            onChange={handleNumberChange("dailyGoal", 30)}
          />
        </label>

        <label>
          Daily Study Time (minutes)
          <input
            type="number"
            min="5"
            max="240"
            value={draftSettings.dailyMinutes}
            onChange={handleNumberChange("dailyMinutes", 20)}
          />
        </label>

        <label>
          Weekly Session Goal
          <input
            type="number"
            min="1"
            max="21"
            value={draftSettings.weeklyGoalSessions}
            onChange={handleNumberChange("weeklyGoalSessions", 5)}
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

        {import.meta.env.DEV ? (
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={Boolean(draftSettings.unlockAllLessons)}
              onChange={(event) => onDraftChange({ unlockAllLessons: event.target.checked })}
            />
            <span>Dev only: unlock all lessons</span>
          </label>
        ) : null}
      </div>

      <div className="setup-preview">
        <h3>Profile Preview</h3>
        <p><strong>{settings?.learnerName || "Learner"}</strong></p>
        <p>{settings?.learnerBio || "No profile details saved yet."}</p>
        <p>Level: {(settings?.selfRatedLevel || "a1").toUpperCase()}</p>
        <p>Plan: {settings?.dailyMinutes ?? 20} min/day, {settings?.weeklyGoalSessions ?? 5} sessions/week</p>
        {import.meta.env.DEV ? <p>Unlock all lessons: {settings?.unlockAllLessons ? "On" : "Off"}</p> : null}
      </div>

      <div className="hero-actions">
        <button className="primary-button" onClick={onSave}>Save Setup</button>
        <button className="ghost-button" onClick={onReset}>Reset Draft</button>
      </div>

      <div className="setup-preview">
        <h3>Danger Zone</h3>
        {canDeleteInApp ? (
          <>
            <p>Deleting your account permanently removes your profile, progress, sessions, and submitted exercises.</p>
            <label>
              Confirm with your password
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                placeholder="Enter your current password"
                autoComplete="current-password"
                disabled={deleteBusy}
              />
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => setDeleteConfirmed(event.target.checked)}
                disabled={deleteBusy}
              />
              <span>I understand this action is permanent and cannot be undone.</span>
            </label>
            <div className="hero-actions">
              <button
                className="ghost-button"
                onClick={handleDeleteAccount}
                disabled={deleteBusy || !deleteConfirmed || !deletePassword}
              >
                {deleteBusy ? "Deleting account..." : "Delete Account"}
              </button>
            </div>
            {deleteError ? <div className="feedback">{deleteError}</div> : null}
          </>
        ) : (
          <p>Account deletion in-app is available only for password-based accounts.</p>
        )}
      </div>
    </section>
  );
}
