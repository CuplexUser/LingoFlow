import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import mascotHero from "./assets/mascot-hero.png";
import learnIcon from "./assets/icon-learn.svg";
import setupIcon from "./assets/icon-setup.svg";
import statsIcon from "./assets/icon-stats.svg";

const PAGE_PATHS = {
  learn: "/learn",
  setup: "/setup",
  stats: "/stats"
};

function getPageFromPathname(pathname) {
  if (pathname === PAGE_PATHS.setup) return "setup";
  if (pathname === PAGE_PATHS.stats) return "stats";
  return "learn";
}

function SessionPlayer({ session, onBack, onFinish }) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [selectedTokenIndexes, setSelectedTokenIndexes] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [speechError, setSpeechError] = useState("");
  const [questionMistakes, setQuestionMistakes] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [revealedAnswers, setRevealedAnswers] = useState(0);

  const supportsSpeech = typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const question = session.questions[index];
  const progress = Math.round(((index + 1) / session.questions.length) * 100);
  const builtWords = question.type === "build_sentence"
    ? selectedTokenIndexes.map((idx) => question.tokens[idx])
    : [];

  useEffect(() => {
    return () => {
      if (supportsSpeech) {
        window.speechSynthesis.cancel();
      }
    };
  }, [supportsSpeech]);

  function getSpeechLanguage() {
    if (session.language === "spanish") return "es-ES";
    if (session.language === "russian") return "ru-RU";
    return "en-US";
  }

  function speakAlternative(text) {
    if (!supportsSpeech) {
      setSpeechError("Speech is not supported in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLanguage();
    utterance.rate = 0.95;
    utterance.onstart = () => setSpeechError("");
    utterance.onerror = () => setSpeechError("Could not play this alternative.");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function toggleToken(tokenIndex) {
    setSelectedTokenIndexes((prev) => {
      if (prev.includes(tokenIndex)) {
        return prev.filter((idx) => idx !== tokenIndex);
      }
      return [...prev, tokenIndex];
    });
    setFeedback(null);
  }

  function resetCurrentSelection() {
    setSelectedOption("");
    setSelectedTokenIndexes([]);
    setFeedback(null);
    setQuestionMistakes(0);
  }

  function isCurrentAnswerCorrect() {
    if (question.type === "mc_sentence") {
      return selectedOption === question.answer;
    }

    const built = selectedTokenIndexes.map((idx) => question.tokens[idx]).join(" ").trim();
    return built === question.answer;
  }

  function canSubmit() {
    if (question.type === "mc_sentence") {
      return Boolean(selectedOption);
    }
    return selectedTokenIndexes.length > 0;
  }

  function submitAnswer() {
    if (!canSubmit()) return;

    const correct = isCurrentAnswerCorrect();
    if (!correct) {
      const nextMistakes = questionMistakes + 1;
      setQuestionMistakes(nextMistakes);
      setTotalMistakes((value) => value + 1);
      setHintsUsed((value) => value + 1);

      const answerWords = question.answer.split(" ").filter(Boolean);
      const showReveal = nextMistakes >= 2;

      setFeedback({
        type: "error",
        message: "Incorrect. Try again before moving on.",
        hint: showReveal
          ? "Use reveal to inspect the correct sentence and self-correct."
          : "Check sentence structure and try again.",
        showReveal,
        answerWords,
        correctOption: question.type === "mc_sentence" ? question.answer : null
      });
      return;
    }

    const nextScore = score + 1;
    setScore(nextScore);

    if (index === session.questions.length - 1) {
      onFinish(nextScore, session.questions.length, totalMistakes, hintsUsed, revealedAnswers);
      return;
    }

    resetCurrentSelection();
    setIndex((value) => value + 1);
  }

  function revealAnswer() {
    const answerWords = question.answer.split(" ").filter(Boolean);
    if (question.type === "mc_sentence") {
      setSelectedOption(question.answer);
    } else {
      const usedIndexes = new Set();
      const orderedIndexes = answerWords
        .map((word) => {
          const tokenIndex = question.tokens.findIndex(
            (token, idx) => token === word && !usedIndexes.has(idx)
          );
          if (tokenIndex >= 0) usedIndexes.add(tokenIndex);
          return tokenIndex;
        })
        .filter((tokenIndex) => tokenIndex >= 0);
      setSelectedTokenIndexes(orderedIndexes);
    }

    setHintsUsed((value) => value + 1);
    setRevealedAnswers((value) => value + 1);
    setFeedback((prev) =>
      prev
        ? {
            ...prev,
            message: "Answer revealed. Rebuild it and submit.",
            hint: "Use the highlighted order, then press Check."
          }
        : prev
    );
  }

  const builtSentence = question.type === "build_sentence" ? builtWords.join(" ") : "";

  return (
    <section className="panel lesson-player">
      <div className="lesson-header">
        <button className="ghost-button" onClick={onBack}>Exit Session</button>
        <div className="meter">
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="challenge-badges">
        <span>{session.categoryLabel}</span>
        <span>Level: {session.recommendedLevel.toUpperCase()}</span>
        <span>{index + 1}/{session.questions.length}</span>
      </div>

      <h2>{question.prompt}</h2>
      {speechError ? <p className="speech-error">{speechError}</p> : null}

      {question.type === "mc_sentence" ? (
        <div className="options">
          {question.options.map((option) => (
            <div key={option} className="option-row">
              <button
                className={`option ${selectedOption === option ? "selected" : ""}`}
                onClick={() => {
                  setSelectedOption(option);
                  setFeedback(null);
                }}
              >
                {option}
              </button>
              <button
                type="button"
                className="speak-button"
                onClick={() => speakAlternative(option)}
                aria-label={`Speak alternative: ${option}`}
              >
                Speak
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="build-target">{builtSentence || "Tap words to build your sentence"}</div>
          <div className="tokens">
            {question.tokens.map((token, tokenIndex) => {
              const active = selectedTokenIndexes.includes(tokenIndex);
              return (
                <button
                  key={`${token}-${tokenIndex}`}
                  className={`token ${active ? "selected" : ""}`}
                  onClick={() => toggleToken(tokenIndex)}
                >
                  {token}
                </button>
              );
            })}
          </div>
        </>
      )}

      {feedback ? (
        <div className={`feedback ${feedback.type}`}>
          <strong>{feedback.message}</strong>
          <span>{feedback.hint}</span>
          {feedback.correctOption ? (
            <div className="expected-option">
              Correct sentence:
              <div className="option correct-answer">{feedback.correctOption}</div>
            </div>
          ) : null}
          {feedback.answerWords ? (
            <div className="expected-words">
              {feedback.answerWords.map((word, wordIndex) => {
                const matched = builtWords[wordIndex] === word;
                return (
                  <span
                    key={`${word}-${wordIndex}`}
                    className={`expected-word ${matched ? "matched" : "missing"}`}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
          ) : null}
          {feedback.showReveal ? (
            <button className="ghost-button" onClick={revealAnswer}>
              Reveal Answer
            </button>
          ) : null}
        </div>
      ) : null}

      <button className="primary-button" onClick={submitAnswer} disabled={!canSubmit()}>
        Check
      </button>
    </section>
  );
}

function LearnPage({
  settings,
  progress,
  courseCategories,
  activeSession,
  onStartCategory,
  onFinishSession,
  onExitSession,
  onOpenSetup,
  onOpenStats
}) {
  if (activeSession) {
    return (
      <SessionPlayer
        session={activeSession}
        onBack={onExitSession}
        onFinish={onFinishSession}
      />
    );
  }

  return (
    <>
      <section className="panel hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Daily Practice</p>
          <h2>Hi {settings?.learnerName || "Learner"}, ready for a quick challenge?</h2>
          <p>
            Keep your streak alive by finishing one category. Your current focus is
            {" "}<strong>{settings?.focusArea || "everyday conversation"}</strong>.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenSetup}>Edit Setup</button>
            <button className="ghost-button" onClick={onOpenStats}>View Stats</button>
          </div>
        </div>
        <img src={mascotHero} alt="Cartoon Lingo buddy" className="hero-art" />
      </section>

      <section className="panel categories">
        <h2>Course Categories</h2>
        <p className="subtitle">Each session is randomized and adapts to your mastery level.</p>
        <div className="category-grid">
          {courseCategories.map((category) => (
            <article key={category.id} className="category-card">
              <div>
                <h3>{category.label}</h3>
                <p>{category.description}</p>
                <p>Mastery: {category.mastery.toFixed(1)}%</p>
                <p>Accuracy: {category.accuracy.toFixed(1)}%</p>
                <p>Unlocked: {category.levelUnlocked.toUpperCase()}</p>
              </div>
              <button className="primary-button" onClick={() => onStartCategory(category)}>
                Start Challenge
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel quick-strip">
        <div>
          <strong>Level {progress?.learnerLevel ?? 1}</strong>
          <span>{progress?.totalXp ?? 0} XP</span>
        </div>
        <div>
          <strong>{progress?.streak ?? 0} day streak</strong>
          <span>{progress?.hearts ?? 5} hearts left</span>
        </div>
      </section>
    </>
  );
}

function SetupPage({ languages, settings, draftSettings, onDraftChange, onSave, onReset }) {
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
      </div>

      <div className="hero-actions">
        <button className="primary-button" onClick={onSave}>Save Setup</button>
        <button className="ghost-button" onClick={onReset}>Reset Draft</button>
      </div>
    </section>
  );
}

function StatsPage({ settings, progress, courseCategories }) {
  const totalCategories = courseCategories.length || 1;
  const completionPercent = Math.round(
    courseCategories.reduce((sum, category) => sum + category.mastery, 0) / totalCategories
  );

  const practicedCategories = courseCategories.filter((category) => category.attempts > 0);
  const accuracyPercent = practicedCategories.length
    ? Math.round(
        practicedCategories.reduce((sum, category) => sum + category.accuracy, 0) /
          practicedCategories.length
      )
    : 0;

  const masteredCount = courseCategories.filter((category) => category.mastery >= 75).length;

  return (
    <section className="panel stats-panel">
      <h2>Statistics</h2>
      <p className="subtitle">Track completion, consistency, and category accuracy.</p>

      <div className="stats-grid">
        <article className="stat-card">
          <h3>% Completed</h3>
          <strong>{completionPercent}%</strong>
          <p>Based on average mastery across all categories.</p>
        </article>

        <article className="stat-card">
          <h3>Accuracy</h3>
          <strong>{accuracyPercent}%</strong>
          <p>Average of categories you have practiced.</p>
        </article>

        <article className="stat-card">
          <h3>Mastered Categories</h3>
          <strong>{masteredCount}/{courseCategories.length || 0}</strong>
          <p>Categories with at least 75% mastery.</p>
        </article>

        <article className="stat-card">
          <h3>Streak</h3>
          <strong>{progress?.streak ?? 0} days</strong>
          <p>{settings?.learnerName || "Learner"}, keep your rhythm strong.</p>
        </article>
      </div>

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

const DEFAULT_DRAFT = {
  nativeLanguage: "english",
  targetLanguage: "spanish",
  dailyGoal: 30,
  learnerName: "Learner",
  learnerBio: "",
  focusArea: ""
};

export default function App() {
  const [languages, setLanguages] = useState([]);
  const [settings, setSettings] = useState(null);
  const [draftSettings, setDraftSettings] = useState(DEFAULT_DRAFT);
  const [progress, setProgress] = useState(null);
  const [courseCategories, setCourseCategories] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [activePage, setActivePage] = useState(() => {
    if (typeof window === "undefined") return "learn";
    return getPageFromPathname(window.location.pathname);
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function refreshCourseAndProgress(targetLanguage) {
    const [course, prog] = await Promise.all([
      api.getCourse(targetLanguage),
      api.getProgress(targetLanguage)
    ]);
    setCourseCategories(course);
    setProgress(prog);
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
    if (!settings) return;
    setDraftSettings({ ...DEFAULT_DRAFT, ...settings });
  }, [settings]);

  useEffect(() => {
    function onPopState() {
      const nextPage = getPageFromPathname(window.location.pathname);
      setActivePage(nextPage);
      if (nextPage !== "learn") {
        setActiveSession(null);
      }
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
    if (nextPage !== "learn") {
      setActiveSession(null);
    }
  }

  async function saveSetup() {
    if (!settings) return;

    try {
      const saved = await api.saveSettings({ ...settings, ...draftSettings });
      setSettings(saved);
      setStatusMessage("Setup saved. Your learner profile has been updated.");

      if (saved.targetLanguage !== settings.targetLanguage) {
        await refreshCourseAndProgress(saved.targetLanguage);
      }
    } catch (_error) {
      setStatusMessage("Could not save setup changes.");
    }
  }

  async function startCategory(category) {
    if (!settings) return;

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

  async function finishSession(score, maxScore, mistakes, usedHints, usedReveals) {
    if (!activeSession || !settings) return;

    try {
      const result = await api.completeSession({
        language: settings.targetLanguage,
        category: activeSession.category,
        score,
        maxScore,
        mistakes,
        hintsUsed: usedHints,
        revealedAnswers: usedReveals,
        difficultyLevel: activeSession.recommendedLevel
      });

      setStatusMessage(
        `Session complete: ${score}/${maxScore} (mistakes: ${mistakes}). +${result.xpGained} XP. ` +
        `Mastery ${result.mastery.toFixed(1)}% (${result.levelUnlocked.toUpperCase()})`
      );

      setActiveSession(null);
      await refreshCourseAndProgress(settings.targetLanguage);
    } catch (_error) {
      setStatusMessage("Could not save session progress.");
    }
  }

  const dailyProgressPercent = useMemo(() => {
    if (!settings || !progress) return 0;
    return Math.min(100, Math.round((progress.totalXp / settings.dailyGoal) * 100));
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
        <div className="stats">
          <span>Level: {progress?.learnerLevel ?? 1}</span>
          <span>XP: {progress?.totalXp ?? 0}</span>
          <span>Streak: {progress?.streak ?? 0}</span>
          <span>Hearts: {progress?.hearts ?? 5}</span>
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

      {activePage === "learn" ? (
        <LearnPage
          settings={settings}
          progress={progress}
          courseCategories={courseCategories}
          activeSession={activeSession}
          onStartCategory={startCategory}
          onFinishSession={finishSession}
          onExitSession={() => setActiveSession(null)}
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
        />
      ) : null}
    </main>
  );
}
