import { useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../api";
import type { LanguageOption, LearnerSettings } from "../types/course";

type SetupPageProps = {
  languages: LanguageOption[];
  settings: LearnerSettings | null;
  draftSettings: LearnerSettings;
  authProvider?: string;
  accountEmail?: string;
  onDraftChange: (patch: Partial<LearnerSettings>) => void;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  onDeleteAccount: (payload: { password?: string; confirmEmail?: string; confirmDelete: boolean }) => Promise<void>;
};

export function SetupPage({
  languages,
  settings,
  draftSettings,
  authProvider,
  accountEmail,
  onDraftChange,
  onSave,
  onReset,
  onDeleteAccount
}: SetupPageProps) {
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const learningLanguages = languages.filter(
    (language) => language.id !== draftSettings.nativeLanguage
  );
  // Password accounts confirm with the password; Google accounts type their email.
  const isPasswordAccount = authProvider === "local";
  const emailMatches = Boolean(accountEmail)
    && deleteEmail.trim().toLowerCase() === String(accountEmail).trim().toLowerCase();
  const deleteReady = deleteConfirmed && (isPasswordAccount ? Boolean(deletePassword) : emailMatches);

  function handleNumberChange(
    key: "dailyGoal" | "dailyMinutes" | "weeklyGoalSessions",
    fallback: number
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onDraftChange({ [key]: Number(event.target.value) || fallback });
    };
  }

  async function handleDeleteAccount() {
    if (!deleteReady) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await onDeleteAccount(
        isPasswordAccount
          ? { password: deletePassword, confirmDelete: true }
          : { confirmEmail: deleteEmail.trim(), confirmDelete: true }
      );
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

        <label>
          Listening Speed
          <select
            value={String(draftSettings.speechRate ?? 0.92)}
            onChange={(event) => onDraftChange({ speechRate: Number(event.target.value) })}
          >
            <option value="0.6">Slow (0.6×)</option>
            <option value="0.8">Relaxed (0.8×)</option>
            <option value="0.92">Normal (0.92×)</option>
            <option value="1">Natural (1.0×)</option>
            <option value="1.2">Fast (1.2×)</option>
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

      <PasswordSection isPasswordAccount={isPasswordAccount} />

      <div className="setup-preview">
        <h3>Danger Zone</h3>
        <p>Deleting your account permanently removes your profile, progress, sessions, and submitted exercises.</p>
        <p>This does not cancel a Premium subscription bought in Google Play. Cancel that in Google Play.</p>
        {isPasswordAccount ? (
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
        ) : (
          <label>
            Type your account email to confirm
            <input
              type="email"
              value={deleteEmail}
              onChange={(event) => setDeleteEmail(event.target.value)}
              placeholder={accountEmail || "Your account email"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={deleteBusy}
            />
          </label>
        )}
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
            disabled={deleteBusy || !deleteReady}
          >
            {deleteBusy ? "Deleting account..." : "Delete Account"}
          </button>
        </div>
        {deleteError ? <div className="feedback">{deleteError}</div> : null}
      </div>
    </section>
  );
}

const MIN_PASSWORD_LENGTH = 8;

function PasswordSection({ isPasswordAccount }: { isPasswordAccount: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isPasswordAccount) {
    return (
      <div className="setup-preview">
        <h3>Password</h3>
        <p>You sign in with Google, so there is no LingoFlow password to change. Manage your password in your Google account.</p>
      </div>
    );
  }

  const mismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;
  const ready = Boolean(currentPassword)
    && newPassword.length >= MIN_PASSWORD_LENGTH
    && newPassword === confirmPassword;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ ok: true, text: "Password changed." });
    } catch (error: unknown) {
      setFeedback({ ok: false, text: error instanceof Error ? error.message : "Could not change password." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="setup-preview password-form" onSubmit={handleSubmit}>
      <h3>Password</h3>
      <label>
        Current password
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          disabled={busy}
        />
      </label>
      <label>
        New password
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          disabled={busy}
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          disabled={busy}
        />
      </label>
      {mismatch ? <p className="field-hint">The new passwords do not match.</p> : null}
      <div className="hero-actions">
        <button className="primary-button" type="submit" disabled={busy || !ready}>
          {busy ? "Changing password..." : "Change Password"}
        </button>
      </div>
      {feedback ? (
        <div className={`feedback${feedback.ok ? " success" : ""}`} role="status">{feedback.text}</div>
      ) : null}
    </form>
  );
}
