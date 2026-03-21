import { useEffect, useRef, useState } from "react";

function normalizeSentence(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function similarityRatio(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLen);
}

function isPronunciationCloseEnough(expected, submitted, threshold = 0.9) {
  const normalizedExpected = normalizeSentence(expected);
  const normalizedSubmitted = normalizeSentence(submitted);
  if (!normalizedSubmitted) return false;
  if (normalizedSubmitted === normalizedExpected) return true;
  return similarityRatio(normalizedExpected, normalizedSubmitted) >= threshold;
}

function joinBuiltWords(question, selectedTokenIndexes) {
  return question.type === "build_sentence" || question.type === "dictation_sentence"
    ? selectedTokenIndexes.map((idx) => question.tokens[idx]).join(" ")
    : "";
}

export function SessionPlayer({ session, onBack, onFinish, onSnapshot }) {
  const resumeState = session.resumeState || {};
  const fixedQuestionCount = Math.max(
    1,
    Number(resumeState.fixedQuestionCount) || session.questions.length || 1
  );
  const [questionsQueue] = useState(() => {
    const resumedQueue = Array.isArray(resumeState.questionsQueue)
      ? resumeState.questionsQueue.slice(0, fixedQuestionCount)
      : [];
    return resumedQueue.length ? resumedQueue : session.questions.slice(0, fixedQuestionCount);
  });
  const [index, setIndex] = useState(() => resumeState.index || 0);
  const [score, setScore] = useState(() => resumeState.score || 0);
  const [selectedOption, setSelectedOption] = useState(() => resumeState.selectedOption || "");
  const [selectedTokenIndexes, setSelectedTokenIndexes] = useState(
    () => resumeState.selectedTokenIndexes || []
  );
  const [attemptLog, setAttemptLog] = useState(() => resumeState.attemptLog || []);
  const [feedback, setFeedback] = useState(() => resumeState.feedback || null);
  const [revealedCurrentQuestion, setRevealedCurrentQuestion] = useState(
    () => resumeState.revealedCurrentQuestion || false
  );
  const [roleplayHintVisible, setRoleplayHintVisible] = useState(
    () => resumeState.roleplayHintVisible || false
  );
  const [speechError, setSpeechError] = useState("");
  const [questionMistakes, setQuestionMistakes] = useState(() => resumeState.questionMistakes || 0);
  const [totalMistakes, setTotalMistakes] = useState(() => resumeState.totalMistakes || 0);
  const [hintsUsed, setHintsUsed] = useState(() => resumeState.hintsUsed || 0);
  const [revealedAnswers, setRevealedAnswers] = useState(() => resumeState.revealedAnswers || 0);
  const [flashcardRevealed, setFlashcardRevealed] = useState(
    () => resumeState.flashcardRevealed || false
  );
  const [pronunciationTranscript, setPronunciationTranscript] = useState(
    () => resumeState.pronunciationTranscript || ""
  );
  const [practiceWordMatches, setPracticeWordMatches] = useState(
    () => resumeState.practiceWordMatches || []
  );
  const [practiceLeftOrder, setPracticeLeftOrder] = useState(
    () => resumeState.practiceLeftOrder || []
  );
  const [practiceRightOrder, setPracticeRightOrder] = useState(
    () => resumeState.practiceRightOrder || []
  );
  const [practiceSelection, setPracticeSelection] = useState(
    () => resumeState.practiceSelection || { left: "", right: "" }
  );
  const [practiceFeedback, setPracticeFeedback] = useState(
    () => resumeState.practiceFeedback || ""
  );
  const [matchingPairs, setMatchingPairs] = useState(() => resumeState.matchingPairs || []);
  const [matchingPrompt, setMatchingPrompt] = useState(null);
  const [matchingPromptOrder, setMatchingPromptOrder] = useState(() => resumeState.matchingPromptOrder || []);
  const [matchingAnswerOrder, setMatchingAnswerOrder] = useState(() => resumeState.matchingAnswerOrder || []);
  const snapshotRef = useRef("");
  const draggedWordIndexRef = useRef(null);
  const builtWordDropHandledRef = useRef(false);
  const audioContextRef = useRef(null);
  const practiceCompletedRef = useRef(false);

  const supportsSpeech = typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const supportsRecognition = typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const question = questionsQueue[index];
  const currentStep = Math.min(index + 1, fixedQuestionCount);
  const progress = Math.round((currentStep / fixedQuestionCount) * 100);
  const builtWords = question.type === "build_sentence" || question.type === "dictation_sentence"
    ? selectedTokenIndexes.map((idx) => question.tokens[idx])
    : [];
  const builtSentence = joinBuiltWords(question, selectedTokenIndexes);

  useEffect(() => {
    return () => {
      if (supportsSpeech) {
        window.speechSynthesis.cancel();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [supportsSpeech]);

  useEffect(() => {
    function shuffleArray(items) {
      const next = [...items];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    }

    if (question?.type !== "matching") return;
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const prompts = pairs.map((pair) => pair.prompt).filter(Boolean);
    const answers = pairs.map((pair) => pair.answer).filter(Boolean);
    setMatchingPromptOrder(shuffleArray(prompts));
    setMatchingAnswerOrder(shuffleArray(answers));
  }, [question?.id, question?.type]);

  useEffect(() => {
    function shuffleArray(items) {
      const next = [...items];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    }

    if (question?.type !== "practice_words") return;
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const lefts = pairs.map((pair) => pair.left).filter(Boolean);
    const rights = pairs.map((pair) => pair.right).filter(Boolean);
    setPracticeLeftOrder(shuffleArray(lefts));
    setPracticeRightOrder(shuffleArray(rights));
    setPracticeWordMatches([]);
    setPracticeSelection({ left: "", right: "" });
    setPracticeFeedback("");
    practiceCompletedRef.current = false;
  }, [question?.id, question?.type]);

  useEffect(() => {
    const snapshot = {
      questionsQueue,
      fixedQuestionCount,
      index,
      score,
      selectedOption,
      selectedTokenIndexes,
      attemptLog,
      feedback,
      revealedCurrentQuestion,
      roleplayHintVisible,
      questionMistakes,
      totalMistakes,
      hintsUsed,
      revealedAnswers,
      flashcardRevealed,
      pronunciationTranscript,
      practiceWordMatches,
      practiceLeftOrder,
      practiceRightOrder,
      practiceSelection,
      practiceFeedback,
      matchingPairs,
      matchingPrompt,
      matchingPromptOrder,
      matchingAnswerOrder
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized !== snapshotRef.current) {
      snapshotRef.current = serialized;
      onSnapshot(snapshot);
    }
  }, [
    questionsQueue,
    fixedQuestionCount,
    index,
    score,
    selectedOption,
    selectedTokenIndexes,
    attemptLog,
    feedback,
    revealedCurrentQuestion,
    roleplayHintVisible,
    questionMistakes,
    totalMistakes,
    hintsUsed,
    revealedAnswers,
    flashcardRevealed,
    pronunciationTranscript,
    practiceWordMatches,
    practiceLeftOrder,
    practiceRightOrder,
    practiceSelection,
    practiceFeedback,
    matchingPairs,
    matchingPrompt,
    matchingPromptOrder,
    matchingAnswerOrder,
    onSnapshot
  ]);

  function getSpeechLanguage() {
    if (session.language === "spanish") return "es-ES";
    if (session.language === "russian") return "ru-RU";
    if (session.language === "italian") return "it-IT";
    if (session.language === "swedish") return "sv-SE";
    return "en-US";
  }

  async function playAudioUrl(url, playbackRate = 1) {
    if (typeof window === "undefined" || !window.AudioContext) {
      setSpeechError("Web Audio is not supported in this browser.");
      return;
    }
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
      }
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      const safePlaybackRate = Number.isFinite(playbackRate) ? playbackRate : 1;
      source.playbackRate.value = safePlaybackRate;
      source.connect(audioContextRef.current.destination);
      source.start();
      setSpeechError("");
    } catch (_error) {
      setSpeechError("Could not play this audio clip.");
    }
  }

  function speakText(text, language = getSpeechLanguage(), rate = 0.95) {
    if (!supportsSpeech) {
      setSpeechError("Speech is not supported in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    const safeRate = Number.isFinite(rate) ? rate : 0.95;
    utterance.rate = safeRate;
    utterance.onstart = () => setSpeechError("");
    utterance.onerror = () => setSpeechError("Could not play this audio hint.");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function speakAlternative(text) {
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl);
      return;
    }
    speakText(text);
  }

  function speakBuildTranslationHint() {
    const translatedSentence = String(question.answer || "").trim();
    if (!translatedSentence) return;
    setHintsUsed((value) => value + 1);
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl);
      return;
    }
    speakText(translatedSentence, getSpeechLanguage());
  }

  function speakPronunciationTarget(playbackRate = 1) {
    const targetSentence = String(question.answer || "").trim();
    if (!targetSentence) return;
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl, playbackRate);
      return;
    }
    speakText(targetSentence, getSpeechLanguage(), Math.max(0.1, playbackRate));
  }

  function startPronunciationCheck() {
    if (!supportsRecognition) {
      setSpeechError("Speech recognition is not supported in this browser.");
      return;
    }
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new RecognitionCtor();
    recognition.lang = getSpeechLanguage();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      setPronunciationTranscript(transcript);
      setSelectedOption(transcript);
      setFeedback(null);
      setSpeechError("");
    };
    recognition.onerror = () => setSpeechError("Pronunciation capture failed.");
    recognition.start();
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

  function applyMatchingAssignment(prompt, answer, fromPrompt = "") {
    const normalizedPrompt = String(prompt || "");
    const normalizedAnswer = String(answer || "");
    const normalizedFromPrompt = String(fromPrompt || "");
    if (!normalizedPrompt || !normalizedAnswer) return;

    // 1-to-1: move the answer, don't duplicate it.
    setMatchingPairs((prev) => {
      const filtered = prev.filter((pair) =>
        pair.prompt !== normalizedPrompt &&
        pair.prompt !== normalizedFromPrompt &&
        pair.answer !== normalizedAnswer
      );
      return [...filtered, { prompt: normalizedPrompt, answer: normalizedAnswer }];
    });
    setFeedback(null);
  }

  function clearMatchingAssignment(prompt) {
    const normalizedPrompt = String(prompt || "");
    if (!normalizedPrompt) return;
    setMatchingPairs((prev) => prev.filter((pair) => pair.prompt !== normalizedPrompt));
    setFeedback(null);
  }

  function startMatchingDrag(event, answer, fromPrompt = "") {
    if (!event?.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ answer, fromPrompt }));
  }

  function readMatchingDragPayload(event) {
    try {
      const raw = event?.dataTransfer?.getData("text/plain") || "";
      const parsed = JSON.parse(raw);
      const answer = String(parsed?.answer || "");
      const fromPrompt = String(parsed?.fromPrompt || "");
      if (!answer) return null;
      return { answer, fromPrompt };
    } catch (_error) {
      return null;
    }
  }

  function resetCurrentSelection() {
    setSelectedOption("");
    setSelectedTokenIndexes([]);
    setFeedback(null);
    setRevealedCurrentQuestion(false);
    setRoleplayHintVisible(false);
    setQuestionMistakes(0);
    setFlashcardRevealed(false);
    setPronunciationTranscript("");
    setPracticeWordMatches([]);
    setPracticeSelection({ left: "", right: "" });
    setPracticeFeedback("");
    setPracticeLeftOrder([]);
    setPracticeRightOrder([]);
    setMatchingPairs([]);
    setMatchingPrompt(null);
    setMatchingPromptOrder([]);
    setMatchingAnswerOrder([]);
  }

  function isCurrentAnswerCorrect() {
    if (
      question.type === "mc_sentence" ||
      question.type === "dialogue_turn" ||
      question.type === "roleplay" ||
      question.type === "practice_listen"
    ) {
      return normalizeSentence(selectedOption) === normalizeSentence(question.answer);
    }
    if (question.type === "cloze_sentence") return selectedOption === question.clozeAnswer;
    if (question.type === "flashcard") return selectedOption === "known";
    if (question.type === "pronunciation" || question.type === "practice_speak") {
      return isPronunciationCloseEnough(
        question.answer,
        pronunciationTranscript || selectedOption,
        0.9
      );
    }
    if (question.type === "practice_words") {
      return practiceWordMatches.length === (question.pairs?.length || 0);
    }
    if (question.type === "matching") {
      return matchingPairs.length === (question.pairs?.length || 0) &&
        question.pairs.every((pair) => matchingPairs.some(
          (candidate) =>
            normalizeSentence(candidate.prompt) === normalizeSentence(pair.prompt) &&
            normalizeSentence(candidate.answer) === normalizeSentence(pair.answer)
        ));
    }
    const variants = [question.answer, ...(question.acceptedAnswers || [])].map((value) => normalizeSentence(value));
    return variants.includes(normalizeSentence(builtSentence));
  }

  function canSubmit() {
    if (
      question.type === "mc_sentence" ||
      question.type === "dialogue_turn" ||
      question.type === "roleplay" ||
      question.type === "practice_listen" ||
      question.type === "cloze_sentence"
    ) {
      return Boolean(selectedOption);
    }
    if (question.type === "flashcard") return flashcardRevealed && Boolean(selectedOption);
    if (question.type === "pronunciation" || question.type === "practice_speak") {
      return Boolean(pronunciationTranscript || selectedOption);
    }
    if (question.type === "matching") return matchingPairs.length === (question.pairs?.length || 0);
    if (question.type === "practice_words") return false;
    return selectedTokenIndexes.length > 0;
  }

  function buildAttemptEntry() {
    return {
      questionId: question.id,
      type: question.type,
      selectedOption:
        question.type === "mc_sentence" ||
        question.type === "dialogue_turn" ||
        question.type === "roleplay" ||
        question.type === "cloze_sentence" ||
        question.type === "flashcard" ||
        question.type === "practice_listen"
          ? selectedOption
          : "",
      builtSentence:
        question.type === "build_sentence" || question.type === "dictation_sentence"
          ? builtSentence
          : "",
      textAnswer:
        question.type === "pronunciation" || question.type === "practice_speak"
          ? (pronunciationTranscript || selectedOption)
          : "",
      revealed: revealedCurrentQuestion,
      matchingPairs: question.type === "matching" ? matchingPairs : [],
      practicePairs: question.type === "practice_words" ? practiceWordMatches : []
    };
  }

  function goNext(nextAttemptLog, nextScore) {
    if (index === questionsQueue.length - 1) {
      onFinish({
        attempts: nextAttemptLog,
        score: nextScore,
        maxScore: fixedQuestionCount,
        mistakes: totalMistakes,
        hintsUsed,
        revealedAnswers
      });
      return;
    }

    resetCurrentSelection();
    setIndex((value) => value + 1);
  }

  function submitAnswer() {
    if (!canSubmit()) return;

    if (question.type === "flashcard") {
      const attemptEntry = buildAttemptEntry();
      const nextAttemptLog = [...attemptLog, attemptEntry];
      setAttemptLog(nextAttemptLog);

      const knewIt = selectedOption === "known";
      const nextScore = knewIt ? score + 1 : score;
      if (knewIt) setScore(nextScore);
      goNext(nextAttemptLog, nextScore);
      return;
    }

    const correct = isCurrentAnswerCorrect();
    const attemptEntry = buildAttemptEntry();
    const nextAttemptLog = [...attemptLog, attemptEntry];
    setAttemptLog(nextAttemptLog);

    if (!correct) {
      const nextMistakes = questionMistakes + 1;
      setQuestionMistakes(nextMistakes);
      setTotalMistakes((value) => value + 1);
      if (question.type !== "roleplay") {
        setHintsUsed((value) => value + 1);
      }

      const answerWords = String(question.answer || "").split(" ").filter(Boolean);
      const showReveal = question.type !== "roleplay" && nextMistakes >= 2;

      setFeedback({
        type: "error",
        message: "Incorrect. Try again before moving on.",
        hint: showReveal
          ? "Use reveal to inspect the correct answer and self-correct."
          : "Check the meaning and try again.",
        showReveal,
        answerWords:
          question.type === "build_sentence" || question.type === "dictation_sentence"
            ? answerWords
            : null,
        correctOption:
          question.type === "roleplay"
            ? null
            : question.type === "mc_sentence" ||
          question.type === "dialogue_turn" ||
          question.type === "cloze_sentence" ||
          question.type === "pronunciation" ||
          question.type === "flashcard"
            ? (question.type === "cloze_sentence" ? question.clozeAnswer : question.answer)
            : null
      });
      return;
    }

    const nextScore = revealedCurrentQuestion ? score : score + 1;
    if (!revealedCurrentQuestion) {
      setScore(nextScore);
    }
    goNext(nextAttemptLog, nextScore);
  }

  function skipPronunciationExercise() {
    if (question.type !== "pronunciation") return;
    setSpeechError("");
    goNext(attemptLog, score);
  }

  function revealAnswer() {
    if (question.type === "roleplay") return;
    const answerWords = String(question.answer || "").split(" ").filter(Boolean);
    if (question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "roleplay") {
      setSelectedOption(question.answer);
    } else if (question.type === "cloze_sentence") {
      setSelectedOption(question.clozeAnswer);
    } else if (question.type === "flashcard") {
      setFlashcardRevealed(true);
    } else if (question.type === "pronunciation") {
      setPronunciationTranscript(question.answer);
      setSelectedOption(question.answer);
    } else if (question.type === "practice_speak") {
      setPronunciationTranscript(question.answer);
      setSelectedOption(question.answer);
    } else if (question.type === "matching") {
      setMatchingPairs((question.pairs || []).map((pair) => ({ prompt: pair.prompt, answer: pair.answer })));
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
    setRevealedCurrentQuestion(true);
    setFeedback((prev) =>
      prev
        ? {
            ...prev,
            message: "Answer revealed. Rebuild it and submit.",
            hint: "Use the highlighted answer, then press Check."
          }
        : prev
    );
  }

  function handlePracticeWordPick(side, value) {
    setPracticeFeedback("");
    const selected = {
      left: side === "left" ? value : practiceSelection.left,
      right: side === "right" ? value : practiceSelection.right
    };
    setPracticeSelection(selected);
    if (!selected.left || !selected.right) return;
    const correctPair = (question.pairs || []).find((pair) =>
      pair.left === selected.left && pair.right === selected.right
    );
    if (correctPair) {
      setPracticeWordMatches((prev) => {
        if (prev.some((pair) => pair.left === selected.left || pair.right === selected.right)) {
          return prev;
        }
        return [...prev, { left: selected.left, right: selected.right }];
      });
      setPracticeFeedback("Correct match.");
    } else {
      setPracticeFeedback("Incorrect match. Try again.");
    }
    setPracticeSelection({ left: "", right: "" });
  }

  useEffect(() => {
    if (question.type !== "practice_words") return;
    if (!question.pairs?.length) return;
    if (practiceWordMatches.length !== question.pairs.length) return;
    if (practiceCompletedRef.current) return;
    practiceCompletedRef.current = true;
    const attemptEntry = buildAttemptEntry();
    const nextAttemptLog = [...attemptLog, attemptEntry];
    setAttemptLog(nextAttemptLog);
    onFinish({
      attempts: nextAttemptLog,
      score,
      maxScore: fixedQuestionCount,
      mistakes: totalMistakes,
      hintsUsed,
      revealedAnswers
    });
  }, [
    question.type,
    question.pairs,
    practiceWordMatches,
    attemptLog,
    score,
    fixedQuestionCount,
    totalMistakes,
    hintsUsed,
    revealedAnswers,
    onFinish
  ]);

  function renderBuildInterface(dictation = false) {
    return (
      <>
        <div className="build-hints">
          <button
            type="button"
            className="speak-button"
            onClick={speakBuildTranslationHint}
            aria-label={dictation ? "Listen to sentence audio" : "Listen to the prompt translation"}
          >
            {dictation ? "Play Audio" : "Hint: Listen Translation"}
          </button>
          {question.hints?.length ? <span className="hint-chip">{question.hints[0]}</span> : null}
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
                >
                  {word}
                </span>
              ))}
            </div>
          ) : (
            dictation ? "Listen and build the sentence" : "Tap words to build your sentence"
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
    );
  }

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
        {question.type === "roleplay" ? <span>Roleplay</span> : null}
        <span>{currentStep}/{fixedQuestionCount}</span>
      </div>

      <h2>{question.prompt}</h2>
      {question.type === "roleplay" ? (
        <div className="build-hints">
          <button
            type="button"
            className="speak-button"
            onClick={() => {
              setHintsUsed((value) => value + 1);
              setRoleplayHintVisible(true);
              setFeedback(null);
            }}
          >
            Hint: English Response
          </button>
          {roleplayHintVisible ? (
            <span className="hint-chip">{question.answerEnglish || "No English hint available."}</span>
          ) : null}
        </div>
      ) : null}
      {question.type === "roleplay" && question.hints?.length ? (
        <div className="build-hints">
          <span className="hint-chip">{question.hints[0]}</span>
        </div>
      ) : null}
      {question.type === "pronunciation" || question.type === "practice_speak" ? (
        <p className="pronunciation-target">
          <strong>Say:</strong> {question.answer}
        </p>
      ) : null}
      {question.imageUrl ? <img className="exercise-image" src={question.imageUrl} alt="" /> : null}
      {question.culturalNote ? <p className="cultural-note">{question.culturalNote}</p> : null}
      {speechError ? <p className="speech-error">{speechError}</p> : null}

      {question.type === "mc_sentence" || question.type === "dialogue_turn" || question.type === "roleplay" ? (
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
              <button type="button" className="speak-button" onClick={() => speakAlternative(option)}>
                Speak
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {question.type === "practice_listen" ? (
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
            </div>
          ))}
        </div>
      ) : null}

      {question.type === "cloze_sentence" ? (
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
      ) : null}

      {question.type === "build_sentence" ? renderBuildInterface(false) : null}
      {question.type === "dictation_sentence" ? renderBuildInterface(true) : null}

      {question.type === "flashcard" ? (
        <div className="flashcard-shell">
          <button className="flashcard" type="button" onClick={() => setFlashcardRevealed((value) => !value)}>
            <strong>{flashcardRevealed ? question.back || question.answer : question.front || question.prompt}</strong>
            <span>{flashcardRevealed ? "Back" : "Front"} side</span>
          </button>
          <div className="hero-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setFlashcardRevealed(true);
                setSelectedOption("review");
              }}
            >
              Need Review
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setFlashcardRevealed(true);
                setSelectedOption("known");
              }}
            >
              I Knew This
            </button>
          </div>
        </div>
      ) : null}

      {question.type === "matching" ? (
        <div className="matching-shell">
          <p className="matching-instructions">
            Drag each translation piece onto the correct prompt slot.
          </p>
          <div className="matching-puzzle">
            <div className="puzzle-board">
              {(matchingPromptOrder.length ? matchingPromptOrder : question.pairs.map((pair) => pair.prompt)).map(
                (prompt) => {
                  const assigned = matchingPairs.find((entry) => entry.prompt === prompt)?.answer || "";
                  const filled = Boolean(assigned);
                  return (
                    <div className="puzzle-row" key={prompt}>
                      <div className="puzzle-piece puzzle-prompt">{prompt}</div>
                      <div
                        className={`puzzle-slot ${filled ? "filled" : ""}`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const payload = readMatchingDragPayload(event);
                          if (!payload) return;
                          applyMatchingAssignment(prompt, payload.answer, payload.fromPrompt);
                        }}
                      >
                        {filled ? (
                          <>
                            <div
                              className="puzzle-piece puzzle-answer"
                              draggable
                              onDragStart={(event) => startMatchingDrag(event, assigned, prompt)}
                            >
                              {assigned}
                            </div>
                            <button
                              className="ghost-button puzzle-clear"
                              type="button"
                              onClick={() => clearMatchingAssignment(prompt)}
                            >
                              Clear
                            </button>
                          </>
                        ) : (
                          <span className="puzzle-placeholder">Drop answer here</span>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            <div
              className="puzzle-pool"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const payload = readMatchingDragPayload(event);
                if (!payload?.fromPrompt) return;
                clearMatchingAssignment(payload.fromPrompt);
              }}
            >
              {(matchingAnswerOrder.length ? matchingAnswerOrder : question.pairs.map((pair) => pair.answer))
                .filter((answer) => !matchingPairs.some((entry) => entry.answer === answer))
                .map((answer) => (
                  <div
                    key={answer}
                    className="puzzle-piece puzzle-answer"
                    draggable
                    onDragStart={(event) => startMatchingDrag(event, answer, "")}
                  >
                    {answer}
                  </div>
                ))}
              {(matchingAnswerOrder.length ? matchingAnswerOrder : question.pairs.map((pair) => pair.answer))
                .filter((answer) => !matchingPairs.some((entry) => entry.answer === answer)).length === 0 ? (
                <span className="puzzle-pool-empty">All answers placed.</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {question.type === "pronunciation" ? (
        <div className="pronunciation-shell">
          <div className="hero-actions">
            <button className="speak-button" type="button" onClick={speakBuildTranslationHint}>
              Play Prompt
            </button>
            <button className="ghost-button" type="button" onClick={startPronunciationCheck}>
              Start Pronunciation Check
            </button>
            <button className="ghost-button" type="button" onClick={skipPronunciationExercise}>
              Can&apos;t speak now
            </button>
          </div>
          <label>
            Transcript
            <input
              value={pronunciationTranscript}
              onChange={(event) => {
                setPronunciationTranscript(event.target.value);
                setSelectedOption(event.target.value);
                setFeedback(null);
              }}
              placeholder="Speech transcript or typed fallback"
            />
          </label>
        </div>
      ) : null}

      {question.type === "practice_speak" ? (
        <div className="pronunciation-shell">
          <div className="hero-actions">
            <button className="speak-button" type="button" onClick={() => speakPronunciationTarget()}>
              Listen
            </button>
            <button className="speak-button" type="button" onClick={() => speakPronunciationTarget(0.70)}>
              Listen (slow)
            </button>
            <button className="ghost-button" type="button" onClick={startPronunciationCheck}>
              Start Pronunciation Check
            </button>
          </div>
          <label>
            Transcript
            <input
              value={pronunciationTranscript}
              onChange={(event) => {
                setPronunciationTranscript(event.target.value);
                setSelectedOption(event.target.value);
                setFeedback(null);
              }}
              placeholder="Speech transcript or typed fallback"
            />
          </label>
        </div>
      ) : null}

      {question.type === "practice_listen" ? (
        <div className="pronunciation-shell">
          <div className="hero-actions">
            <button
              className="speak-button"
              type="button"
              onClick={() => {
                if (question.audioUrl) {
                  playAudioUrl(question.audioUrl);
                } else {
                  speakText(question.answer, getSpeechLanguage());
                }
              }}
            >
              Play Audio
            </button>
          </div>
        </div>
      ) : null}

      {question.type === "practice_words" ? (
        <div className="matching-shell practice-words">
          <p className="matching-instructions">
            Tap a word on the left, then its translation on the right. Correct pairs stay locked.
          </p>
          <div className="practice-words-grid">
            <div className="practice-words-column">
              {(practiceLeftOrder.length ? practiceLeftOrder : (question.pairs || []).map((pair) => pair.left)).map(
                (left) => {
                  const matched = practiceWordMatches.find((pair) => pair.left === left);
                  const selected = practiceSelection.left === left;
                  return (
                    <button
                      key={left}
                      className={`puzzle-piece practice-word ${matched ? "filled" : ""} ${selected ? "selected" : ""}`}
                      type="button"
                      onClick={() => {
                        if (matched) return;
                        handlePracticeWordPick("left", left);
                      }}
                    >
                      {left}
                      {matched ? <span className="practice-word-match">✓</span> : null}
                    </button>
                  );
                }
              )}
            </div>
            <div className="practice-words-column">
              {(practiceRightOrder.length ? practiceRightOrder : (question.pairs || []).map((pair) => pair.right)).map(
                (right) => {
                  const matched = practiceWordMatches.find((pair) => pair.right === right);
                  const selected = practiceSelection.right === right;
                  return (
                    <button
                      key={right}
                      className={`puzzle-piece practice-word ${matched ? "filled" : ""} ${selected ? "selected" : ""}`}
                      type="button"
                      onClick={() => {
                        if (matched) return;
                        handlePracticeWordPick("right", right);
                      }}
                    >
                      {right}
                      {matched ? <span className="practice-word-match">✓</span> : null}
                    </button>
                  );
                }
              )}
            </div>
          </div>
          {practiceFeedback ? <p className="lock-note">{practiceFeedback}</p> : null}
        </div>
      ) : null}

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

      {question.type !== "practice_words" ? (
        <button
          className="primary-button"
          onClick={submitAnswer}
          disabled={!canSubmit()}
        >
          Check
        </button>
      ) : null}
    </section>
  );
}
