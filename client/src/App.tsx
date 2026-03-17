import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import contributeIcon from "./assets/icon-contribute.svg";
import learnIcon from "./assets/icon-learn.svg";
import practiceIcon from "./assets/icon-practice.svg";
import setupIcon from "./assets/icon-setup.svg";
import statsIcon from "./assets/icon-stats.svg";
import { AuthPage } from "./components/AuthPage";
import { ContributePage } from "./components/ContributePage";
import { LearnPage } from "./components/LearnPage";
import { PracticePage } from "./components/PracticePage";
import { SetupPage } from "./components/SetupPage";
import { StatsPage } from "./components/StatsPage";
import { appVersion } from "./version";
import {
  AUTH_PATHS,
  AUTH_TOKEN_STORAGE_KEY,
  DEFAULT_DRAFT,
  PAGE_PATHS,
  THEME_STORAGE_KEY,
  type ThemeMode
} from "./constants";
import { getPageFromPathname, getSystemTheme, resolveTheme } from "./utils/theme";

type AuthMode = "login" | "register" | "forgotPassword" | "resetPassword";
type AppPage = "learn" | "practice" | "contribute" | "setup" | "stats";
const ACTIVE_COURSE_LANGUAGE_STORAGE_KEY = "lingoflow_active_course_language";
const ACTIVE_SESSIONS_STORAGE_KEY = "lingoflow_active_sessions";

function loadStoredSessionsByLanguage() {
  if (typeof window === "undefined") return {};
  try {
    const rawMap = window.localStorage.getItem(ACTIVE_SESSIONS_STORAGE_KEY);
    if (rawMap) {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, any>;
      }
    }

    const legacyRaw = window.localStorage.getItem("lingoflow_active_session");
    if (!legacyRaw) return {};
    const legacy = JSON.parse(legacyRaw);
    if (!legacy || !legacy.language || !Array.isArray(legacy.questions) || !legacy.questions.length) {
      return {};
    }
    return { [legacy.language]: legacy };
  } catch (_error) {
    return {};
  }
}

function getAuthModeFromPathname(pathname: string): AuthMode {
  if (pathname === AUTH_PATHS.register) return "register";
  if (pathname === AUTH_PATHS.forgotPassword) return "forgotPassword";
  if (pathname === AUTH_PATHS.resetPassword) return "resetPassword";
  return "login";
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    if (typeof window === "undefined") return "login";
    return getAuthModeFromPathname(window.location.pathname);
  });
  const [resetToken, setResetToken] = useState("");
  const [authUser, setAuthUser] = useState<any>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  const [languages, setLanguages] = useState<any[]>([]);
  const [activeCourseLanguage, setActiveCourseLanguage] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(ACTIVE_COURSE_LANGUAGE_STORAGE_KEY) || "").trim().toLowerCase();
  });
  const [settings, setSettings] = useState<any>(null);
  const [draftSettings, setDraftSettings] = useState<any>(DEFAULT_DRAFT);
  const [progress, setProgress] = useState<any>(null);
  const [progressOverview, setProgressOverview] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);
  const [courseCategories, setCourseCategories] = useState<any[]>([]);
  const [activeSessionsByLanguage, setActiveSessionsByLanguage] = useState<Record<string, any>>(
    () => loadStoredSessionsByLanguage()
  );
  const [activePage, setActivePage] = useState<AppPage>(() => {
    if (typeof window === "undefined") return "learn";
    return getPageFromPathname(window.location.pathname);
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  });

  const activeTheme = useMemo(() => resolveTheme(themeMode), [themeMode]);
  const activeSession = activeCourseLanguage ? activeSessionsByLanguage[activeCourseLanguage] || null : null;

  async function hydrateAuthenticatedApp() {
    const [langs, conf] = await Promise.all([api.getLanguages(), api.getSettings()]);
    setLanguages(langs);
    setSettings(conf);
    setDraftSettings({ ...DEFAULT_DRAFT, ...conf });
    const availableLanguageIds = new Set((langs || []).map((item: any) => item.id));
    const preferredLanguage = String(activeCourseLanguage || "").toLowerCase();
    const initialCourseLanguage = availableLanguageIds.has(preferredLanguage)
      ? preferredLanguage
      : String(conf.targetLanguage || "spanish").toLowerCase();
    setActiveCourseLanguage(initialCourseLanguage);
    await refreshCourseAndProgress(initialCourseLanguage);
  }

  async function refreshCourseAndProgress(targetLanguage: string) {
    const [course, prog, stats, overview] = await Promise.all([
      api.getCourse(targetLanguage),
      api.getProgress(targetLanguage),
      api.getStats(targetLanguage),
      api.getProgressOverview()
    ]);
    setCourseCategories(course as any[]);
    setProgress(prog);
    setStatsData(stats);
    setProgressOverview(overview);
  }

  async function switchCourseLanguage(nextLanguage: string) {
    const safeLanguage = String(nextLanguage || "").trim().toLowerCase();
    if (!safeLanguage || safeLanguage === activeCourseLanguage) return;
    try {
      setActiveCourseLanguage(safeLanguage);
      await refreshCourseAndProgress(safeLanguage);
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not switch course language right now.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const oauthToken = String(url.searchParams.get("authToken") || "").trim();
        const oauthError = String(url.searchParams.get("authError") || "").trim();
        if (oauthToken) {
          api.setAuthToken(oauthToken);
        }
        if (oauthToken || oauthError) {
          url.searchParams.delete("authToken");
          url.searchParams.delete("authError");
          const nextQuery = url.searchParams.toString();
          window.history.replaceState(
            {},
            "",
            `${url.pathname}${nextQuery ? `?${nextQuery}` : ""}${url.hash}`
          );
        }
        if (oauthError && !oauthToken) {
          setAuthError(oauthError);
        }
      }

      const token = api.getAuthToken();
      if (!token) {
        if (!cancelled) {
          setAuthUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const me = await api.getMe();
        if (cancelled) return;
        setAuthUser(me.user);
        await hydrateAuthenticatedApp();
      } catch (_error) {
        api.clearAuthToken();
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        }
        setAuthUser(null);
        setAuthError("Your session expired. Please sign in again.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    async function verifyEmailFromUrl() {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (url.pathname !== "/verify-email") return;

      const token = url.searchParams.get("token");
      if (!token) {
        setAuthError("Missing verification token.");
        window.history.replaceState({}, "", AUTH_PATHS.login);
        return;
      }

      setLoading(false);
      setAuthBusy(true);
      setAuthError("");
      setAuthNotice("");
      try {
        const result = await api.verifyEmail({ token });
        setAuthMode("login");
        setAuthNotice(result?.message || "Email verified. You can sign in now.");
      } catch (error: any) {
        setAuthError(error.message || "Email verification failed.");
      } finally {
        setAuthBusy(false);
        window.history.replaceState({}, "", AUTH_PATHS.login);
      }
    }

    verifyEmailFromUrl();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.pathname !== AUTH_PATHS.resetPassword) return;
    const token = String(url.searchParams.get("token") || "").trim();
    setResetToken(token);
    setAuthMode("resetPassword");
    if (!token) {
      setAuthError("Missing password reset token.");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    if (themeMode !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.setAttribute("data-theme", getSystemTheme());
    };
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [themeMode]);

  useEffect(() => {
    if (!settings) return;
    setDraftSettings({ ...DEFAULT_DRAFT, ...settings });
  }, [settings]);

  useEffect(() => {
    function onPopState() {
      if (!authUser) {
        setAuthMode(getAuthModeFromPathname(window.location.pathname));
        return;
      }
      const nextPage = getPageFromPathname(window.location.pathname);
      setActivePage(nextPage);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authUser]);

  useEffect(() => {
    const knownPaths = authUser
      ? Object.values(PAGE_PATHS)
      : Object.values(AUTH_PATHS);
    if (!knownPaths.includes(window.location.pathname as any)) {
      window.history.replaceState({}, "", authUser ? PAGE_PATHS.learn : AUTH_PATHS.login);
      if (authUser) {
        setActivePage("learn");
      } else {
        setAuthMode("login");
      }
    }
  }, [authUser]);

  function navigateToPage(nextPage: AppPage) {
    const path = PAGE_PATHS[nextPage] || PAGE_PATHS.learn;
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setActivePage(nextPage);
  }

  function navigateAuthMode(nextMode: AuthMode) {
    const safeMode = nextMode;
    const path = AUTH_PATHS[safeMode];
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setAuthMode(safeMode);
    if (safeMode !== "login") {
      setLoginFailureCount(0);
    }
    if (safeMode !== "resetPassword") {
      setResetToken("");
    }
  }

  async function onAuthSuccess(payload: any) {
    if (!payload?.token || !payload?.user) {
      throw new Error("Authentication response is invalid");
    }
    api.setAuthToken(payload.token);
    setAuthUser(payload.user);
    setAuthError("");
    setAuthNotice("");
    setLoginFailureCount(0);
    setStatusMessage(`Welcome back, ${payload.user.displayName || "Learner"}!`);
    await hydrateAuthenticatedApp();
    navigateToPage("learn");
  }

  async function register(form: { displayName: string; email: string; password: string }) {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.register(form);
      setAuthMode("login");
      setAuthNotice(
        payload?.message || "Account created. Check your email for a verification link before sign in."
      );
    } catch (error: any) {
      setAuthError(error.message || "Could not register.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function login(form: { email: string; password: string }) {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.login(form);
      await onAuthSuccess(payload);
    } catch (error: any) {
      setLoginFailureCount((prev) => prev + 1);
      setAuthError(error.message || "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resendVerification(email: string) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError("Enter your email first, then resend verification.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.resendVerification({ email: normalizedEmail });
      setAuthNotice(
        payload?.message ||
        "If your account is still pending verification, we sent a new email."
      );
    } catch (error: any) {
      setAuthError(error.message || "Could not resend verification email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function forgotPassword(email: string) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError("Enter your email to reset your password.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.forgotPassword({ email: normalizedEmail });
      setAuthNotice(
        payload?.message ||
        "If an account exists for this email, a password reset link has been sent."
      );
    } catch (error: any) {
      setAuthError(error.message || "Could not send password reset email.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword(form: { token: string; password: string }) {
    const token = String(form?.token || "").trim();
    const password = String(form?.password || "");
    if (!token) {
      setAuthError("Missing password reset token.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.resetPassword({ token, password });
      setAuthMode("login");
      setResetToken("");
      setAuthNotice(payload?.message || "Password reset successful. You can sign in now.");
      if (window.location.pathname !== AUTH_PATHS.login) {
        window.history.replaceState({}, "", AUTH_PATHS.login);
      }
    } catch (error: any) {
      setAuthError(error.message || "Could not reset password.");
    } finally {
      setAuthBusy(false);
    }
  }

  function startGoogleOAuth() {
    if (typeof window === "undefined") return;
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    window.location.assign(api.getGoogleOAuthStartUrl());
  }

  function signOut() {
    api.clearAuthToken();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_SESSIONS_STORAGE_KEY);
      window.localStorage.removeItem(ACTIVE_COURSE_LANGUAGE_STORAGE_KEY);
      window.localStorage.removeItem("lingoflow_active_session");
    }
    setAuthUser(null);
    setSettings(null);
    setProgress(null);
    setProgressOverview(null);
    setStatsData(null);
    setCourseCategories([]);
    setActiveSessionsByLanguage({});
    setActiveCourseLanguage("");
    setStatusMessage("You have signed out.");
    setAuthNotice("");
  }

  async function saveSetup() {
    if (!settings) return;

    try {
      const saved = await api.saveSettings({ ...settings, ...draftSettings });
      setSettings(saved);
      const languageIds = new Set((languages || []).map((item: any) => item.id));
      const resolvedLanguage = languageIds.has(activeCourseLanguage)
        ? activeCourseLanguage
        : String(saved.targetLanguage || "spanish").toLowerCase();
      setActiveCourseLanguage(resolvedLanguage);
      setStatusMessage("Setup saved. Your learner profile has been updated.");
      await refreshCourseAndProgress(resolvedLanguage);
    } catch (_error) {
      setStatusMessage("Could not save setup changes.");
    }
  }

  async function startCategory(category: any) {
    if (!settings || !activeCourseLanguage) return;
    if (!category.unlocked) {
      setStatusMessage(category.lockReason || "This category is still locked.");
      return;
    }

    try {
      const session: any = await api.startSession({
        language: activeCourseLanguage,
        category: category.id,
        count: 10
      });

      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel: category.label
        }
      }));
      navigateToPage("learn");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start session for this category.");
    }
  }

  async function startPractice(mode: string, category: any) {
    if (!settings || !activeCourseLanguage) return;
    if (!category) return;

    try {
      const session: any = await api.startSession({
        language: activeCourseLanguage,
        category: category.id,
        count: 10,
        mode
      });

      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel: category.label,
          practiceMode: mode
        }
      }));
      navigateToPage("practice");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start a practice session.");
    }
  }

  async function finishSession(sessionReport: any) {
    if (!activeSession || !settings) return;

    try {
      const result: any = await api.completeSession({
        sessionId: activeSession.sessionId,
        language: activeSession.language,
        category: activeSession.category,
        attempts: sessionReport.attempts,
        hintsUsed: sessionReport.hintsUsed,
        revealedAnswers: sessionReport.revealedAnswers
      });

      setStatusMessage(
        `Session complete: ${result.evaluated.score}/${result.evaluated.maxScore} ` +
        `(mistakes: ${result.evaluated.mistakes}). +${result.xpGained} XP. ` +
        `Mastery ${result.mastery.toFixed(1)}% (${result.levelUnlocked.toUpperCase()})`
      );

      setActiveSessionsByLanguage((prev) => {
        const next = { ...prev };
        delete next[activeSession.language];
        return next;
      });
      await refreshCourseAndProgress(activeSession.language);
    } catch (_error) {
      setStatusMessage("Could not save session progress.");
    }
  }

  async function submitContribution(payload: any) {
    const result = await api.contributeExercise(payload);
    setStatusMessage(result?.message || "Exercise submitted for moderation.");
    return result;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeCourseLanguage) return;
    window.localStorage.setItem(ACTIVE_COURSE_LANGUAGE_STORAGE_KEY, activeCourseLanguage);
  }, [activeCourseLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_SESSIONS_STORAGE_KEY, JSON.stringify(activeSessionsByLanguage));
    window.localStorage.removeItem("lingoflow_active_session");
  }, [activeSessionsByLanguage]);

  const dailyProgressPercent = useMemo(() => {
    if (!settings || !progress) return 0;
    return Math.min(100, Math.round(((progress.todayXp || 0) / settings.dailyGoal) * 100));
  }, [settings, progress]);

  const topbarIdentity =
    authUser?.authProvider === "local"
      ? (authUser?.email || authUser?.displayName || "Learner")
      : (authUser?.displayName || authUser?.email || "Learner");
  const activeLanguageLabel = languages.find((item) => item.id === activeCourseLanguage)?.label || "Language";

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
        onModeChange={navigateAuthMode}
        onRegister={register}
        onLogin={login}
        onResendVerification={resendVerification}
        onForgotPassword={forgotPassword}
        onResetPassword={resetPassword}
        onGoogleOAuthStart={startGoogleOAuth}
      />
    );
  }

  const tabs = [
    { id: "learn", label: "Learn", icon: learnIcon },
    { id: "practice", label: "Practice", icon: practiceIcon },
    { id: "contribute", label: "Contribute", icon: contributeIcon },
    { id: "setup", label: "Setup", icon: setupIcon },
    { id: "stats", label: "Stats", icon: statsIcon }
  ] as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>LingoFlow</h1>
          <p className="topbar-subtitle">Focused daily language practice with adaptive challenges.</p>
        </div>
        <div className="topbar-meta">
          <div className="stats">
            <span>{topbarIdentity}</span>
            <span>Course: {activeLanguageLabel}</span>
            <span>Level: {progress?.learnerLevel ?? 1}</span>
            <span>XP: {progress?.totalXp ?? 0}</span>
            <span>Streak: {progress?.streak ?? 0}</span>
          </div>
          <div className="topbar-actions">
            <label className="theme-switcher">
              Course
              <select
                value={activeCourseLanguage}
                onChange={(event) => switchCourseLanguage(event.target.value)}
                aria-label="Active course language"
              >
                {languages.map((language) => (
                  <option key={language.id} value={language.id}>{language.label}</option>
                ))}
              </select>
            </label>
            <label className="theme-switcher">
              Theme
              <select
                value={themeMode}
                onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
                aria-label="Theme mode"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button className="ghost-button" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="nav-strip panel">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tile ${activePage === tab.id ? "active" : ""}`}
            onClick={() => navigateToPage(tab.id)}
          >
            <img src={tab.icon} alt="" />
            <span>{tab.label}</span>
          </button>
        ))}
      </section>

      <section className="panel daily-panel">
        <div className="daily-headline">
          <h2>Daily Goal</h2>
          <strong>{dailyProgressPercent}% complete</strong>
        </div>
        <div className="daily-goal-bar">
          <div style={{ width: `${dailyProgressPercent}%` }} />
        </div>
      </section>

      {statusMessage ? <div className="status">{statusMessage}</div> : null}

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

      {activePage === "learn" ? (
        <LearnPage
          settings={settings}
          progress={progress}
          courseCategories={courseCategories}
          activeSession={activeSession}
          onStartCategory={startCategory}
          onFinishSession={finishSession}
          onExitSession={() => {
            if (!activeCourseLanguage) return;
            setActiveSessionsByLanguage((prev) => {
              const next = { ...prev };
              delete next[activeCourseLanguage];
              return next;
            });
          }}
          onSessionSnapshot={(snapshot: any) =>
            setActiveSessionsByLanguage((prev) => {
              if (!activeCourseLanguage || !prev[activeCourseLanguage]) return prev;
              return {
                ...prev,
                [activeCourseLanguage]: {
                  ...prev[activeCourseLanguage],
                  resumeState: snapshot
                }
              };
            })
          }
          onOpenSetup={() => navigateToPage("setup")}
          onOpenStats={() => navigateToPage("stats")}
        />
      ) : null}

      {activePage === "practice" ? (
        <PracticePage
          courseCategories={courseCategories}
          activeSession={activeSession}
          onStartPractice={startPractice}
          onFinishSession={finishSession}
          onExitSession={() => {
            if (!activeCourseLanguage) return;
            setActiveSessionsByLanguage((prev) => {
              const next = { ...prev };
              delete next[activeCourseLanguage];
              return next;
            });
          }}
          onSessionSnapshot={(snapshot: any) =>
            setActiveSessionsByLanguage((prev) => {
              if (!activeCourseLanguage || !prev[activeCourseLanguage]) return prev;
              return {
                ...prev,
                [activeCourseLanguage]: {
                  ...prev[activeCourseLanguage],
                  resumeState: snapshot
                }
              };
            })
          }
        />
      ) : null}

      {activePage === "contribute" ? (
        <ContributePage
          activeCourseLanguage={activeCourseLanguage}
          courseCategories={courseCategories}
          onSubmitContribution={submitContribution}
        />
      ) : null}

      {activePage === "setup" ? (
        <SetupPage
          languages={languages}
          settings={settings}
          draftSettings={draftSettings}
          onDraftChange={(patch: any) => setDraftSettings((prev: any) => ({ ...prev, ...patch }))}
          onSave={saveSetup}
          onReset={() => setDraftSettings({ ...DEFAULT_DRAFT, ...settings })}
        />
      ) : null}

      {activePage === "stats" ? (
        <StatsPage
          settings={settings}
          progress={progress}
          courseCategories={courseCategories}
          statsData={statsData}
          progressOverview={progressOverview}
          languages={languages}
        />
      ) : null}

      <footer className="app-footer">Version {appVersion}</footer>
    </main>
  );
}
