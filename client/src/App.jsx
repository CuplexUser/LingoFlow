import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import learnIcon from "./assets/icon-learn.svg";
import setupIcon from "./assets/icon-setup.svg";
import statsIcon from "./assets/icon-stats.svg";
import { LearnPage } from "./components/LearnPage";
import { SetupPage } from "./components/SetupPage";
import { StatsPage } from "./components/StatsPage";
import { DEFAULT_DRAFT, PAGE_PATHS, THEME_STORAGE_KEY } from "./constants";
import { getPageFromPathname, getSystemTheme, resolveTheme } from "./utils/theme";

export default function App() {
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
      try {
        const [langs, conf] = await Promise.all([api.getLanguages(), api.getSettings()]);
        if (cancelled) return;

        setLanguages(langs);
        setSettings(conf);
        setDraftSettings({ ...DEFAULT_DRAFT, ...conf });
        await refreshCourseAndProgress(conf.targetLanguage);
      } catch (_error) {
        setStatusMessage("Could not load app data. Check backend status.");
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
      const nextPage = getPageFromPathname(window.location.pathname);
      setActivePage(nextPage);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const knownPaths = Object.values(PAGE_PATHS);
    if (!knownPaths.includes(window.location.pathname)) {
      window.history.replaceState({}, "", PAGE_PATHS.learn);
      setActivePage("learn");
    }
  }, []);

  function navigateToPage(nextPage) {
    const path = PAGE_PATHS[nextPage] || PAGE_PATHS.learn;
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setActivePage(nextPage);
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
            <span>Level: {progress?.learnerLevel ?? 1}</span>
            <span>XP: {progress?.totalXp ?? 0}</span>
            <span>Streak: {progress?.streak ?? 0}</span>
          </div>
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
