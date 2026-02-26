import { useEffect, useRef, useState } from "react";

function normalizeSentence(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function SessionPlayer({ session, onBack, onFinish, onSnapshot }) {
  const resumeState = session.resumeState || {};
  const [questionsQueue, setQuestionsQueue] = useState(() => resumeState.questionsQueue || session.questions);
  const [reinforcedQuestionIds, setReinforcedQuestionIds] = useState(
    () => resumeState.reinforcedQuestionIds || []
  );
  const [index, setIndex] = useState(() => resumeState.index || 0);
  const [score, setScore] = useState(() => resumeState.score || 0);
  const [selectedOption, setSelectedOption] = useState(() => resumeState.selectedOption || "");
  const [selectedTokenIndexes, setSelectedTokenIndexes] = useState(
    () => resumeState.selectedTokenIndexes || []
  );
  const [attemptLog, setAttemptLog] = useState(() => resumeState.attemptLog || []);
  const [feedback, setFeedback] = useState(() => resumeState.feedback || null);
  const [speechError, setSpeechError] = useState("");
  const [questionMistakes, setQuestionMistakes] = useState(() => resumeState.questionMistakes || 0);
  const [totalMistakes, setTotalMistakes] = useState(() => resumeState.totalMistakes || 0);
  const [hintsUsed, setHintsUsed] = useState(() => resumeState.hintsUsed || 0);
  const [revealedAnswers, setRevealedAnswers] = useState(() => resumeState.revealedAnswers || 0);
  const snapshotRef = useRef("");
  const draggedWordIndexRef = useRef(null);
  const builtWordDropHandledRef = useRef(false);

  const supportsSpeech = typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const question = questionsQueue[index];
  const progress = Math.round(((index + 1) / questionsQueue.length) * 100);
  const builtWords = (question.type === "build_sentence" || question.type === "dictation_sentence")
    ? selectedTokenIndexes.map((idx) => question.tokens[idx])
    : [];

  useEffect(() => {
    return () => {
      if (supportsSpeech) {
        window.speechSynthesis.cancel();
      }
    };
  }, [supportsSpeech]);

  useEffect(() => {
    const snapshot = {
      questionsQueue,
      reinforcedQuestionIds,
      index,
      score,
      selectedOption,
      selectedTokenIndexes,
      attemptLog,
      feedback,
      questionMistakes,
      totalMistakes,
      hintsUsed,
      revealedAnswers
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized !== snapshotRef.current) {
      snapshotRef.current = serialized;
      onSnapshot(snapshot);
    }
  }, [
    questionsQueue,
    reinforcedQuestionIds,
    index,
    score,
    selectedOption,
    selectedTokenIndexes,
    attemptLog,
    feedback,
    questionMistakes,
    totalMistakes,
    hintsUsed,
    revealedAnswers,
    onSnapshot
  ]);

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

  function speakText(text, language = getSpeechLanguage()) {
    if (!supportsSpeech) {
      setSpeechError("Speech is not supported in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 0.95;
    utterance.onstart = () => setSpeechError("");
    utterance.onerror = () => setSpeechError("Could not play this audio hint.");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function speakBuildTranslationHint() {
    if (question.type !== "build_sentence") return;
    const translatedSentence = String(question.answer || "").trim();
    if (!translatedSentence) return;
    setHintsUsed((value) => value + 1);
    speakText(translatedSentence, getSpeechLanguage());
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

  function reorderSelectedWords(fromIndex, toIndex) {
    setSelectedTokenIndexes((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev;
      }
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setFeedback(null);
  }

  function removeSelectedWordAt(wordIndex) {
    setSelectedTokenIndexes((prev) => {
      if (wordIndex < 0 || wordIndex >= prev.length) return prev;
      const next = [...prev];
      next.splice(wordIndex, 1);
      return next;
    });
    setFeedback(null);
  }

  function handleBuiltWordDragStart(wordIndex) {
    draggedWordIndexRef.current = wordIndex;
    builtWordDropHandledRef.current = false;
  }

  function handleBuiltWordDrop(targetIndex) {
    const fromIndex = draggedWordIndexRef.current;
    if (!Number.isInteger(fromIndex)) return;
    builtWordDropHandledRef.current = true;
    reorderSelectedWords(fromIndex, targetIndex);
    draggedWordIndexRef.current = null;
  }

  function resetCurrentSelection() {
    setSelectedOption("");
    setSelectedTokenIndexes([]);
    setFeedback(null);
    setQuestionMistakes(0);
  }

  function isCurrentAnswerCorrect() {
    if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
      return selectedOption === question.answer;
    }
    if (question.type === "cloze_sentence") return selectedOption === question.clozeAnswer;
    const built = selectedTokenIndexes.map((idx) => question.tokens[idx]).join(" ");
    const variants = [question.answer, ...(question.acceptedAnswers || [])].map((value) => normalizeSentence(value));
    return variants.includes(normalizeSentence(built));
  }

  function canSubmit() {
    if (question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "cloze_sentence") {
      return Boolean(selectedOption);
    }
    return selectedTokenIndexes.length > 0;
  }

  function submitAnswer() {
    if (!canSubmit()) return;

    const correct = isCurrentAnswerCorrect();
    const attemptEntry = {
      questionId: question.id,
      type: question.type,
      selectedOption:
        question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "cloze_sentence"
          ? selectedOption
          : "",
      builtSentence:
        question.type === "build_sentence" || question.type === "dictation_sentence"
          ? builtWords.join(" ")
          : "",
      textAnswer: ""
    };
    setAttemptLog((prev) => [...prev, attemptEntry]);

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
        answerWords:
          question.type === "build_sentence" || question.type === "dictation_sentence"
            ? answerWords
            : null,
        correctOption:
          question.type === "mc_sentence" ||
          question.type === "dialogue_turn" ||
          question.type === "cloze_sentence"
            ? (question.type === "cloze_sentence" ? question.clozeAnswer : question.answer)
            : null
      });
      return;
    }

    const shouldReinforce = questionMistakes > 0 && !reinforcedQuestionIds.includes(question.id);
    if (shouldReinforce) {
      setQuestionsQueue((prev) => [...prev, question]);
      setReinforcedQuestionIds((prev) => [...prev, question.id]);
    }

    const nextScore = score + 1;
    setScore(nextScore);

    if (index === questionsQueue.length - 1 && !shouldReinforce) {
      onFinish({
        attempts: [...attemptLog, attemptEntry],
        score: nextScore,
        maxScore: questionsQueue.length,
        mistakes: totalMistakes,
        hintsUsed,
        revealedAnswers
      });
      return;
    }

    resetCurrentSelection();
    setIndex((value) => value + 1);
  }

  function revealAnswer() {
    const answerWords = question.answer.split(" ").filter(Boolean);
    if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
      setSelectedOption(question.answer);
    } else if (question.type === "cloze_sentence") {
      setSelectedOption(question.clozeAnswer);
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

  const builtSentence = (
    question.type === "build_sentence" || question.type === "dictation_sentence"
  ) ? builtWords.join(" ") : "";

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
        <span>{index + 1}/{questionsQueue.length}</span>
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
      ) : question.type === "dialogue_turn" ? (
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
      ) : question.type === "cloze_sentence" ? (
        <>
          <div className="build-target">{question.clozeText}</div>
          <div className="tokens">
            {question.clozeOptions.map((token) => (
              <button
                key={token}
                className={`token ${selectedOption === token ? "selected" : ""}`}
                onClick={() => {
                  setSelectedOption(token);
                  setFeedback(null);
                }}
              >
                {token}
              </button>
            ))}
          </div>
        </>
      ) : question.type === "dictation_sentence" ? (
        <>
          <div className="build-hints">
            <button
              type="button"
              className="speak-button"
              onClick={() => speakText(question.audioText || question.answer, getSpeechLanguage())}
              aria-label="Listen to sentence audio"
            >
              Play Audio
            </button>
          </div>
          <div className="build-target">
            {builtSentence ? (
              <div className="built-words">
                {builtWords.map((word, selectedWordIndex) => (
                  <span
                    key={`${word}-${selectedWordIndex}`}
                    className="built-word-chip"
                    draggable
                    onDragStart={() => handleBuiltWordDragStart(selectedWordIndex)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleBuiltWordDrop(selectedWordIndex)}
                    onDragEnd={() => {
                      if (
                        Number.isInteger(draggedWordIndexRef.current) &&
                        !builtWordDropHandledRef.current
                      ) {
                        removeSelectedWordAt(draggedWordIndexRef.current);
                      }
                      draggedWordIndexRef.current = null;
                      builtWordDropHandledRef.current = false;
                    }}
                    aria-label={`Drag to move ${word}`}
                    title="Drag to reorder, or drag outside the box to remove"
                  >
                    {word}
                  </span>
                ))}
              </div>
            ) : (
              "Listen and build the sentence"
            )}
          </div>
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
      ) : (
        <>
          <div className="build-hints">
            <button
              type="button"
              className="speak-button"
              onClick={speakBuildTranslationHint}
              aria-label="Listen to the prompt translation"
            >
              Hint: Listen Translation
            </button>
          </div>

          <div className="build-target">
            {builtSentence ? (
              <div className="built-words">
                {builtWords.map((word, selectedWordIndex) => (
                  <span
                    key={`${word}-${selectedWordIndex}`}
                    className="built-word-chip"
                    draggable
                    onDragStart={() => handleBuiltWordDragStart(selectedWordIndex)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleBuiltWordDrop(selectedWordIndex)}
                    onDragEnd={() => {
                      if (
                        Number.isInteger(draggedWordIndexRef.current) &&
                        !builtWordDropHandledRef.current
                      ) {
                        removeSelectedWordAt(draggedWordIndexRef.current);
                      }
                      draggedWordIndexRef.current = null;
                      builtWordDropHandledRef.current = false;
                    }}
                    aria-label={`Drag to move ${word}`}
                    title="Drag to reorder, or drag outside the box to remove"
                  >
                    {word}
                  </span>
                ))}
              </div>
            ) : (
              "Tap words to build your sentence"
            )}
          </div>
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
              Correct answer:
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
