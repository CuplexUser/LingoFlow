import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import learnIcon from "./assets/icon-learn.svg";
import setupIcon from "./assets/icon-setup.svg";
import statsIcon from "./assets/icon-stats.svg";
import { AuthPage } from "./components/AuthPage";
import { LearnPage } from "./components/LearnPage";
import { SetupPage } from "./components/SetupPage";
import { StatsPage } from "./components/StatsPage";
import {
  AUTH_PATHS,
  AUTH_TOKEN_STORAGE_KEY,
  DEFAULT_DRAFT,
  PAGE_PATHS,
  THEME_STORAGE_KEY
} from "./constants";
import { getPageFromPathname, getSystemTheme, resolveTheme } from "./utils/theme";

export default function App() {
  const [authMode, setAuthMode] = useState(() => {
    if (typeof window === "undefined") return "login";
    if (window.location.pathname === AUTH_PATHS.register) return "register";
    return "login";
  });
  const [authUser, setAuthUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [languages, setLanguages] = useState([]);
  const [settings, setSettings] = useState(null);
  const [draftSettings, setDraftSettings] = useState(DEFAULT_DRAFT);
  const [progress, setProgress] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [courseCategories, setCourseCategories] = useState([]);
  const [activeSession, setActiveSession] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem("lingoflow_active_session");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
        return null;
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  });
  const [activePage, setActivePage] = useState(() => {
    if (typeof window === "undefined") return "learn";
    return getPageFromPathname(window.location.pathname);
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  });

  const activeTheme = useMemo(() => resolveTheme(themeMode), [themeMode]);

  async function hydrateAuthenticatedApp() {
    const [langs, conf] = await Promise.all([api.getLanguages(), api.getSettings()]);
    setLanguages(langs);
    setSettings(conf);
    setDraftSettings({ ...DEFAULT_DRAFT, ...conf });
    await refreshCourseAndProgress(conf.targetLanguage);
  }

  async function refreshCourseAndProgress(targetLanguage) {
    const [course, prog, stats] = await Promise.all([
      api.getCourse(targetLanguage),
      api.getProgress(targetLanguage),
      api.getStats(targetLanguage)
    ]);
    setCourseCategories(course);
    setProgress(prog);
    setStatsData(stats);
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
        window.history.replaceState({}, "", "/");
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
      } catch (error) {
        setAuthError(error.message || "Email verification failed.");
      } finally {
        setAuthBusy(false);
        window.history.replaceState({}, "", "/");
      }
    }

    verifyEmailFromUrl();
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
        setAuthMode(window.location.pathname === AUTH_PATHS.register ? "register" : "login");
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
    if (!knownPaths.includes(window.location.pathname)) {
      window.history.replaceState({}, "", authUser ? PAGE_PATHS.learn : AUTH_PATHS.login);
      if (authUser) {
        setActivePage("learn");
      } else {
        setAuthMode("login");
      }
    }
  }, [authUser]);

  function navigateToPage(nextPage) {
    const path = PAGE_PATHS[nextPage] || PAGE_PATHS.learn;
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setActivePage(nextPage);
  }

  function navigateAuthMode(nextMode) {
    const safeMode = nextMode === "register" ? "register" : "login";
    const path = AUTH_PATHS[safeMode];
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setAuthMode(safeMode);
  }

  async function onAuthSuccess(payload) {
    if (!payload?.token || !payload?.user) {
      throw new Error("Authentication response is invalid");
    }
    api.setAuthToken(payload.token);
    setAuthUser(payload.user);
    setAuthError("");
    setAuthNotice("");
    setStatusMessage(`Welcome back, ${payload.user.displayName || "Learner"}!`);
    await hydrateAuthenticatedApp();
    navigateToPage("learn");
  }

  async function register(form) {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.register(form);
      setAuthMode("login");
      setAuthNotice(
        payload?.message || "Account created. Check your email for a verification link before sign in."
      );
    } catch (error) {
      setAuthError(error.message || "Could not register.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function login(form) {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.login(form);
      await onAuthSuccess(payload);
    } catch (error) {
      setAuthError(error.message || "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resendVerification(email) {
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
    } catch (error) {
      setAuthError(error.message || "Could not resend verification email.");
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
    setAuthUser(null);
    setSettings(null);
    setProgress(null);
    setStatsData(null);
    setCourseCategories([]);
    setActiveSession(null);
    setStatusMessage("You have signed out.");
    setAuthNotice("");
  }

  async function saveSetup() {
    if (!settings) return;

    try {
      const saved = await api.saveSettings({ ...settings, ...draftSettings });
      setSettings(saved);
      setStatusMessage("Setup saved. Your learner profile has been updated.");
      await refreshCourseAndProgress(saved.targetLanguage);
    } catch (_error) {
      setStatusMessage("Could not save setup changes.");
    }
  }

  async function startCategory(category) {
    if (!settings) return;
    if (!category.unlocked) {
      setStatusMessage(category.lockReason || "This category is still locked.");
      return;
    }

    try {
      const session = await api.startSession({
        language: settings.targetLanguage,
        category: category.id,
        count: 10
      });

      setActiveSession({
        ...session,
        categoryLabel: category.label
      });
      navigateToPage("learn");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start session for this category.");
    }
  }

  async function finishSession(sessionReport) {
    if (!activeSession || !settings) return;

    try {
      const result = await api.completeSession({
        sessionId: activeSession.sessionId,
        language: settings.targetLanguage,
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

      setActiveSession(null);
      window.localStorage.removeItem("lingoflow_active_session");
      await refreshCourseAndProgress(settings.targetLanguage);
    } catch (_error) {
      setStatusMessage("Could not save session progress.");
    }
  }

  useEffect(() => {
    if (!activeSession) {
      window.localStorage.removeItem("lingoflow_active_session");
      return;
    }
    window.localStorage.setItem("lingoflow_active_session", JSON.stringify(activeSession));
  }, [activeSession]);

  const dailyProgressPercent = useMemo(() => {
    if (!settings || !progress) return 0;
    return Math.min(100, Math.round(((progress.todayXp || 0) / settings.dailyGoal) * 100));
  }, [settings, progress]);

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
        onModeChange={navigateAuthMode}
        onRegister={register}
        onLogin={login}
        onResendVerification={resendVerification}
        onGoogleOAuthStart={startGoogleOAuth}
      />
    );
  }

  const tabs = [
    { id: "learn", label: "Learn", icon: learnIcon },
    { id: "setup", label: "Setup", icon: setupIcon },
    { id: "stats", label: "Stats", icon: statsIcon }
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>LingoFlow</h1>
          <p className="topbar-subtitle">Focused daily language practice with adaptive challenges.</p>
        </div>
        <div className="topbar-meta">
          <div className="stats">
            <span>{authUser.displayName || "Learner"}</span>
            <span>Level: {progress?.learnerLevel ?? 1}</span>
            <span>XP: {progress?.totalXp ?? 0}</span>
            <span>Streak: {progress?.streak ?? 0}</span>
          </div>
          <div className="topbar-actions">
            <label className="theme-switcher">
              Theme
              <select
                value={themeMode}
                onChange={(event) => setThemeMode(event.target.value)}
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

      {activeSession && activePage !== "learn" ? (
        <div className="status">
          Session paused in <strong>{activeSession.categoryLabel}</strong>.
          <button className="ghost-button" onClick={() => navigateToPage("learn")}>
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
          onExitSession={() => setActiveSession(null)}
          onSessionSnapshot={(snapshot) =>
            setActiveSession((prev) => (prev ? { ...prev, resumeState: snapshot } : prev))
          }
          onOpenSetup={() => navigateToPage("setup")}
          onOpenStats={() => navigateToPage("stats")}
        />
      ) : null}

      {activePage === "setup" ? (
        <SetupPage
          languages={languages}
          settings={settings}
          draftSettings={draftSettings}
          onDraftChange={(patch) => setDraftSettings((prev) => ({ ...prev, ...patch }))}
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
        />
      ) : null}
    </main>
  );
}
