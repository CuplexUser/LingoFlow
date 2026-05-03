import { AuthPage } from "./AuthPage";
import { PageRouter } from "./PageRouter";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import { useCourse } from "../context/CourseContext";
import { useSession } from "../context/SessionContext";
import { useThemeMode } from "../hooks/useThemeMode";
import { appVersion } from "../version";
import type { AppPage } from "../hooks/useAppNavigation";
import type { SharePlatformId } from "../context/SessionContext";

const SHARE_PLATFORMS: Array<{ id: SharePlatformId; label: string }> = [
  { id: "x", label: "Share on X" },
  { id: "whatsapp", label: "Share on WhatsApp" },
  { id: "facebook", label: "Share on Facebook" },
  { id: "telegram", label: "Share on Telegram" }
];

function ShareIcon({ platform }: { platform: SharePlatformId | "native" }) {
  if (platform === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.9 3H22l-6.77 7.73L23 21h-6.1l-4.78-6.24L6.65 21H3.5l7.24-8.27L3 3h6.25l4.32 5.7L18.9 3Zm-1.06 16.2h1.7L8.33 4.7H6.5l11.34 14.5Z" />
      </svg>
    );
  }
  if (platform === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.52 3.48A11.9 11.9 0 0 0 12.03 0C5.4 0 0 5.4 0 12.04c0 2.12.56 4.2 1.62 6.03L0 24l6.12-1.6a12.02 12.02 0 0 0 5.91 1.5h.01c6.64 0 12.04-5.4 12.04-12.03 0-3.22-1.25-6.24-3.56-8.39Zm-8.49 18.4h-.01a9.96 9.96 0 0 1-5.07-1.4l-.37-.22-3.63.95.97-3.53-.24-.36a9.93 9.93 0 0 1-1.54-5.28c0-5.5 4.48-9.98 9.99-9.98a9.9 9.9 0 0 1 7.06 2.93 9.88 9.88 0 0 1 2.92 7.06c0 5.5-4.48 9.98-9.98 9.98Zm5.47-7.48c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.67.15-.2.3-.77.98-.94 1.18-.18.2-.35.22-.65.08-.3-.15-1.24-.46-2.36-1.47a8.86 8.86 0 0 1-1.63-2.03c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.08-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.13 4.54.72.3 1.28.48 1.71.62.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.98H7.9V12h2.54V9.8c0-2.5 1.49-3.88 3.77-3.88 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.62.77-1.62 1.56V12h2.76l-.44 2.9h-2.32v6.98A10 10 0 0 0 22 12Z" />
      </svg>
    );
  }
  if (platform === "telegram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.78 15.17 9.4 20.6c.54 0 .78-.23 1.06-.5l2.54-2.42 5.27 3.86c.97.53 1.65.25 1.91-.9l3.47-16.24h.01c.3-1.42-.51-1.98-1.45-1.63L1.86 10.6c-1.39.54-1.37 1.31-.24 1.66l5.2 1.62L18.9 6.3c.57-.38 1.08-.17.65.2L9.78 15.17Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.35a3.05 3.05 0 0 0 0-1.7l6.7-3.35a3 3 0 1 0-.9-1.8c0 .18.02.35.05.52l-6.7 3.35a3 3 0 1 0 0 2.56l6.7 3.35A3 3 0 1 0 18 16Z" />
    </svg>
  );
}

function NavIcon({ id }: { id: string }) {
  if (id === "learn") return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 5.5C3.5 4.7 4 4.3 4.8 4.5L11 6V19.5L4.8 18C4 17.8 3.5 17.4 3.5 16.6Z"/>
      <path d="M20.5 5.5C20.5 4.7 20 4.3 19.2 4.5L13 6V19.5L19.2 18C20 17.8 20.5 17.4 20.5 16.6Z"/>
      <path d="M5.6 8.5L9.2 9.4M5.6 11.2L9.2 12M14.8 9.4L18.4 8.5M14.8 12L18.4 11.2" strokeWidth="1.1" opacity="0.7"/>
    </svg>
  );
  if (id === "practice") return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5.5" opacity="0.6"/>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
      <path d="M12 3V5.5M12 18.5V21M3 12H5.5M18.5 12H21" strokeWidth="1.2"/>
    </svg>
  );
  if (id === "contribute") return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8.5C4 7.7 4.7 7 5.5 7H14L19 11.5V16.5C19 17.3 18.3 18 17.5 18H10L6 21V18H5.5C4.7 18 4 17.3 4 16.5Z"/>
      <path d="M11 12.5H16M13.5 10V15" strokeWidth="1.4"/>
      <path d="M7 11H9" strokeWidth="1.1" opacity="0.7"/>
    </svg>
  );
  if (id === "setup") return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 6.5H19M5 12H19M5 17.5H19"/>
      <circle cx="9"  cy="6.5"  r="2.4" fill="var(--surface)"/>
      <circle cx="15" cy="12"   r="2.4" fill="var(--surface)"/>
      <circle cx="8"  cy="17.5" r="2.4" fill="var(--surface)"/>
    </svg>
  );
  if (id === "stats") return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 18.5L9 12.5L13 15.5L20 7"/>
      <path d="M14.5 7H20.5V13"/>
      <circle cx="9" cy="12.5" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="13" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>
      <circle cx="20" cy="7" r="1.4" fill="currentColor" stroke="none"/>
    </svg>
  );
  return null;
}

function AchievementIcon({ icon }: { icon: string }) {
  if (icon === "flame") return <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 1c0 0-4 3-4 7a4 4 0 0 0 8 0c0-1.5-.8-2.8-1.5-3.5.1 1-.3 2-1 2.5C9 5.5 8 1 8 1Z"/></svg>;
  if (icon === "star") return <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 1l1.8 4H14l-3.4 2.5 1.3 4L8 9 4.1 11.5l1.3-4L2 5h4.2z"/></svg>;
  if (icon === "trophy") return <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 2h8v5a4 4 0 0 1-8 0V2Zm-2 1h2m10 0h-2M8 11v2m-2 1h4"/></svg>;
  if (icon === "lightning") return <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M9 1L4 9h4l-1 6 6-8H9z"/></svg>;
  if (icon === "globe") return <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12"/></svg>;
  if (icon === "graduate") return <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 2L1 6l7 4 7-4-7-4Zm-4 5v4c0 1.7 1.8 3 4 3s4-1.3 4-3v-4"/></svg>;
  if (icon === "medal") return <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="10" r="5"/><path d="M5 5 8 1l3 4"/></svg>;
  if (icon === "moon") return <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 1a7 7 0 1 0 7 7A5 5 0 0 1 8 1Z"/></svg>;
  if (icon === "sun") return <svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M11.4 4.6l-1.4 1.4M4.6 11.4l-1.4 1.4"/></svg>;
  return <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 1l1.8 4H14l-3.4 2.5 1.3 4L8 9 4.1 11.5l1.3-4L2 5h4.2z"/></svg>;
}

const TABS: Array<{ id: AppPage; label: string }> = [
  { id: "learn",      label: "Learn"      },
  { id: "practice",   label: "Practice"   },
  { id: "contribute", label: "Contribute" },
  { id: "setup",      label: "Setup"      },
  { id: "stats",      label: "Stats"      }
];

export function AppShell() {
  const {
    authUser,
    loading,
    authBusy,
    authError,
    authNotice,
    loginFailureCount,
    resetToken,
    handleNavigateAuthMode,
    register,
    login,
    resendVerification,
    forgotPassword,
    resetPassword,
    startGoogleOAuth,
    signOut
  } = useAuth();
  const { authMode, activePage, navigateToPage } = useNavigation();
  const { setThemeMode, activeTheme } = useThemeMode();
  const {
    progress,
    courseLanguages,
    bookmarks,
    pendingContributionCount,
    activeLanguageLabel,
    switchCourseLanguage
  } = useCourse();
  const {
    activeCourseLanguage,
    activeSession,
    statusMessage,
    mistakeReviewOffer,
    sessionShareLine,
    achievementUnlocks,
    clearAchievementUnlocks,
    startMistakeReview,
    shareToPlatform,
    shareWithNative
  } = useSession();

  if (loading) {
    return <main className="app-shell">Loading LingoFlow...</main>;
  }

  if (!authUser) {
    return (
      <AuthPage
        mode={authMode}
        busy={authBusy}
        errorMessage={authError}
        noticeMessage={authNotice}
        showForgotPassword={loginFailureCount >= 1}
        resetToken={resetToken}
        onModeChange={handleNavigateAuthMode}
        onRegister={register}
        onLogin={login}
        onResendVerification={resendVerification}
        onForgotPassword={forgotPassword}
        onResetPassword={resetPassword}
        onGoogleOAuthStart={startGoogleOAuth}
      />
    );
  }

  const topbarIdentity =
    authUser.authProvider === "local"
      ? (authUser.email || authUser.displayName || "Learner")
      : (authUser.displayName || authUser.email || "Learner");
  const bookmarkCountLabel = bookmarks.length > 99 ? "99+" : String(bookmarks.length);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="32" height="32">
              <circle cx="16" cy="16" r="15" className="brand-ring"/>
              <path d="M9 19C11 14 13 14 16 16S21 18 23 13" className="brand-curve"/>
              <circle cx="23" cy="13" r="1.6" className="brand-dot"/>
            </svg>
          </div>
          <div>
            <h1>LingoFlow</h1>
            <p className="topbar-subtitle">Focused daily language practice with adaptive challenges.</p>
          </div>
        </div>

        <div className="topbar-meta">
          <div className="topbar-chips">
            <span className="chip">{topbarIdentity}</span>
            <span className="chip">Course · <strong>{activeLanguageLabel}</strong></span>
            <span className="chip">Level · <strong>{progress?.learnerLevel ?? 1}</strong></span>
            <span className="chip">XP · <strong className="mono">{(progress?.totalXp ?? 0).toLocaleString()}</strong></span>
            <span className={`chip chip-streak${progress && !progress.todayXp ? " streak-at-risk" : ""}`}>
              <svg viewBox="0 0 16 16" width="12" height="14" fill="none" aria-hidden="true">
                <path d="M8 1.5C9.6 4.2 12 5.4 12 8.6a4 4 0 1 1-8 0C4 6.4 5.6 5.6 6.4 4 6.9 5.2 7.4 5.6 8 5.6 8 4.4 7.8 3 8 1.5z" fill="currentColor"/>
                <path d="M8 9C8.7 10 9.6 10.4 9.6 11.6a1.6 1.6 0 1 1-3.2 0C6.4 10.6 7.2 10.4 7.6 9.4z" fill="var(--surface)" opacity="0.85"/>
              </svg>
              <span className="mono">{progress?.streak ?? 0}</span> day streak
              {progress && !progress.todayXp ? " · practice today!" : ""}
            </span>
          </div>

          <div className="topbar-actions">
            <button
              className={`icon-btn${activePage === "bookmarks" ? " active" : ""}`}
              type="button"
              title="Bookmarks"
              aria-label="Bookmarks"
              onClick={() => navigateToPage("bookmarks")}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 2.5h9v12L8 11l-4.5 3.5z"/>
              </svg>
              {bookmarks.length ? (
                <span className="badge">{bookmarkCountLabel}</span>
              ) : null}
            </button>

            {authUser.canModerateCommunityExercises ? (
              <button
                className={`icon-btn${activePage === "admin" ? " active" : ""}`}
                type="button"
                title={`Admin${pendingContributionCount > 0 ? ` (${pendingContributionCount} pending)` : ""}`}
                aria-label="Admin"
                onClick={() => navigateToPage("admin")}
              >
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/>
                  <path d="M1.5 5.5h13M5.5 5.5v9"/>
                </svg>
                {pendingContributionCount > 0 ? (
                  <span className="badge">{pendingContributionCount > 99 ? "99+" : pendingContributionCount}</span>
                ) : null}
              </button>
            ) : null}

            <div className="course-select">
              <span className="seg-label">Course</span>
              <select
                value={activeCourseLanguage}
                onChange={(event) => switchCourseLanguage(event.target.value)}
                aria-label="Active course language"
              >
                {courseLanguages.map((language) => (
                  <option key={language.id} value={language.id}>{language.label}</option>
                ))}
              </select>
            </div>

            <div className="seg-group">
              <span className="seg-label">Theme</span>
              <div className="seg" role="group" aria-label="Theme">
                <button
                  className={"seg-btn" + (activeTheme === "light" ? " on" : "")}
                  type="button"
                  onClick={() => setThemeMode("light")}
                  aria-pressed={activeTheme === "light"}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <circle cx="8" cy="8" r="3"/>
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3"/>
                  </svg>
                  Light
                </button>
                <button
                  className={"seg-btn" + (activeTheme === "dark" ? " on" : "")}
                  type="button"
                  onClick={() => setThemeMode("dark")}
                  aria-pressed={activeTheme === "dark"}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"/>
                  </svg>
                  Dark
                </button>
              </div>
            </div>

            <button className="topbar-signout" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <nav className="nav-strip">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tile${activePage === tab.id ? " active" : ""}`}
            onClick={() => navigateToPage(tab.id)}
          >
            <span className="nav-glyph"><NavIcon id={tab.id} /></span>
            <span>{tab.label}</span>
            {activePage === tab.id && <span className="nav-dot" aria-hidden="true"/>}
          </button>
        ))}
      </nav>

      {statusMessage ? <div className="status">{statusMessage}</div> : null}

      {mistakeReviewOffer ? (
        <div className="status">
          You have a mistake drill ready.
          <button className="ghost-button" onClick={startMistakeReview}>
            Review mistakes
          </button>
        </div>
      ) : null}

      {sessionShareLine ? (
        <section className="panel setup-preview">
          <h3>Session Share Card</h3>
          <p>{sessionShareLine}</p>
          <div className="share-actions">
            <button
              className="ghost-button share-icon-button"
              onClick={shareWithNative}
            >
              <ShareIcon platform="native" />
              <span>Share</span>
            </button>
            {SHARE_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                className="ghost-button share-icon-button"
                onClick={() => shareToPlatform(platform.id)}
              >
                <ShareIcon platform={platform.id} />
                <span>{platform.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {achievementUnlocks.length > 0 && (
        <div className="achievement-toast" role="status">
          <div className="achievement-toast-header">
            <span className="achievement-toast-title">Achievement unlocked!</span>
            <button className="ghost-button achievement-toast-close" onClick={clearAchievementUnlocks} aria-label="Dismiss">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
            </button>
          </div>
          <ul className="achievement-toast-list">
            {achievementUnlocks.map((a) => (
              <li key={a.id} className="achievement-toast-item">
                <AchievementIcon icon={a.icon} />
                <span>
                  <strong>{a.name}</strong>
                  <span className="achievement-toast-desc">{a.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeSession && activePage !== "learn" && activePage !== "practice" ? (
        <div className="status">
          Session paused in <strong>{activeSession.categoryLabel}</strong>.
          <button
            className="ghost-button"
            onClick={() => navigateToPage(activeSession.practiceMode ? "practice" : "learn")}
          >
            Resume Session
          </button>
        </div>
      ) : null}

      <PageRouter />

      <footer className="app-footer">Version {appVersion}</footer>
    </main>
  );
}
