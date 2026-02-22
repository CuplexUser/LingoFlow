import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

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
    switch (session.language) {
      case "spanish":
        return "es-ES";
      case "russian":
        return "ru-RU";
      case "english":
        return "en-US";
      default:
        return "en-US";
    }
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
          : "Check the sentence structure and try again.",
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
    setIndex((v) => v + 1);
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
        <button className="ghost-button" onClick={onBack}>Exit</button>
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

export default function App() {
  const [languages, setLanguages] = useState([]);
  const [settings, setSettings] = useState(null);
  const [progress, setProgress] = useState(null);
  const [courseCategories, setCourseCategories] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
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

  async function updateSettings(partial) {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    const saved = await api.saveSettings(next);
    setSettings(saved);

    if (partial.targetLanguage) {
      await refreshCourseAndProgress(partial.targetLanguage);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>LingoFlow</h1>
        <div className="stats">
          <span>Level: {progress?.learnerLevel ?? 1}</span>
          <span>XP: {progress?.totalXp ?? 0}</span>
          <span>Streak: {progress?.streak ?? 0}</span>
          <span>Hearts: {progress?.hearts ?? 5}</span>
        </div>
      </header>

      {statusMessage ? <div className="status">{statusMessage}</div> : null}

      <section className="panel settings">
        <h2>Learning Setup</h2>
        <div className="settings-grid">
          <label>
            Native Language
            <select
              value={settings?.nativeLanguage || "english"}
              onChange={(e) => updateSettings({ nativeLanguage: e.target.value })}
            >
              {languages.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Learning Language
            <select
              value={settings?.targetLanguage || "spanish"}
              onChange={(e) => updateSettings({ targetLanguage: e.target.value })}
            >
              {languages.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Daily Goal (XP)
            <input
              type="number"
              min="20"
              max="500"
              value={settings?.dailyGoal || 30}
              onChange={(e) => updateSettings({ dailyGoal: Number(e.target.value) || 30 })}
            />
          </label>
        </div>
        <div className="daily-goal-bar">
          <div style={{ width: `${dailyProgressPercent}%` }} />
        </div>
      </section>

      {activeSession ? (
        <SessionPlayer
          session={activeSession}
          onBack={() => setActiveSession(null)}
          onFinish={finishSession}
        />
      ) : (
        <section className="panel categories">
          <h2>Course Categories</h2>
          <p className="subtitle">Each session is randomized and adapts to your mastery.</p>
          <div className="category-grid">
            {courseCategories.map((category) => (
              <article key={category.id} className="category-card">
                <div>
                  <h3>{category.label}</h3>
                  <p>{category.description}</p>
                  <p>Phrases: {category.totalPhrases}</p>
                  <p>Mastery: {category.mastery.toFixed(1)}%</p>
                  <p>Accuracy: {category.accuracy.toFixed(1)}%</p>
                  <p>Unlocked: {category.levelUnlocked.toUpperCase()}</p>
                </div>
                <button className="primary-button" onClick={() => startCategory(category)}>
                  Start Challenge
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
