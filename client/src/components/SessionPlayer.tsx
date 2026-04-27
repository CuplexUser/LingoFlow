import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AudioActionPanel,
  BuildSentencePanel,
  ClozeSentencePanel,
  FeedbackPanel,
  FlashcardPanel,
  MatchingPanel,
  MultipleChoicePanel,
  PracticeWordsPanel,
  TranscriptExercisePanel
} from "./session/SessionPanels";
import {
  joinBuiltWords,
  splitSentenceWords,
  shuffleArray
} from "./session/sessionHelpers";
import { useSessionEngine } from "./session/useSessionEngine";
import { useSessionSnapshot } from "./session/useSessionSnapshot";
import { useSessionSpeech } from "./session/useSessionSpeech";
import { api } from "../api";
import type {
  ActiveSession,
  SessionFeedback,
  SessionQuestion,
  SessionReport,
  SessionSnapshot
} from "../types/session";

type SessionPlayerProps = {
  session: ActiveSession;
  onBack: () => void;
  onFinish: (report: SessionReport) => void | Promise<void>;
  onSnapshot: (snapshot: SessionSnapshot) => void;
};

type MatchingPair = {
  prompt: string;
  answer: string;
};

type PracticeWordPair = {
  left: string;
  right: string;
};

type MatchingDragPayload = {
  answer: string;
  fromPrompt: string;
};

function normalizeHintToken(token: string): string {
  return String(token || "")
    .toLowerCase()
    .replace(/^[«»"“”‘’(){}.,!?;:]+/g, "")
    .replace(/[«»"“”‘’(){}.,!?;:]+$/g, "")
    .trim();
}

export function SessionPlayer({ session, onBack, onFinish, onSnapshot }: SessionPlayerProps) {
  const resumeState = session.resumeState || {};
  const fixedQuestionCount = Math.max(
    1,
    Number(resumeState.fixedQuestionCount) || session.questions.length || 1
  );
  const [questionsQueue] = useState<SessionQuestion[]>(() => {
    const resumedQueue = Array.isArray(resumeState.questionsQueue)
      ? resumeState.questionsQueue.slice(0, fixedQuestionCount)
      : [];
    return resumedQueue.length ? resumedQueue : session.questions.slice(0, fixedQuestionCount);
  });
  const [index, setIndex] = useState(() => resumeState.index || 0);
  const [score, setScore] = useState(() => resumeState.score || 0);
  const [selectedOption, setSelectedOption] = useState(() => resumeState.selectedOption || "");
  const [selectedTokenIndexes, setSelectedTokenIndexes] = useState<number[]>(
    () => resumeState.selectedTokenIndexes || []
  );
  const [attemptLog, setAttemptLog] = useState(() => resumeState.attemptLog || []);
  const [mistakeQuestionIds, setMistakeQuestionIds] = useState<string[]>(
    () => resumeState.mistakeQuestionIds || []
  );
  const [feedback, setFeedback] = useState<SessionFeedback | null>(() => resumeState.feedback || null);
  const [revealedCurrentQuestion, setRevealedCurrentQuestion] = useState(
    () => resumeState.revealedCurrentQuestion || false
  );
  const [roleplayHintVisible, setRoleplayHintVisible] = useState(
    () => resumeState.roleplayHintVisible || false
  );
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
  const [practiceWordMatches, setPracticeWordMatches] = useState<PracticeWordPair[]>(
    () => resumeState.practiceWordMatches || []
  );
  const [practiceLeftOrder, setPracticeLeftOrder] = useState<string[]>(
    () => resumeState.practiceLeftOrder || []
  );
  const [practiceRightOrder, setPracticeRightOrder] = useState<string[]>(
    () => resumeState.practiceRightOrder || []
  );
  const [practiceSelection, setPracticeSelection] = useState<PracticeWordPair>(
    () => resumeState.practiceSelection || { left: "", right: "" }
  );
  const [practiceFeedback, setPracticeFeedback] = useState(
    () => resumeState.practiceFeedback || ""
  );
  const [practiceCompleted, setPracticeCompleted] = useState(false);
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>(() => resumeState.matchingPairs || []);
  const [matchingPromptOrder, setMatchingPromptOrder] = useState<string[]>(() => resumeState.matchingPromptOrder || []);
  const [matchingAnswerOrder, setMatchingAnswerOrder] = useState<string[]>(() => resumeState.matchingAnswerOrder || []);
  const [buildHintCount, setBuildHintCount] = useState(0);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const draggedWordIndexRef = useRef<number | null>(null);
  const builtWordDropHandledRef = useRef(false);

  const question = questionsQueue[index];
  const currentStep = Math.min(index + 1, fixedQuestionCount);

  // Mirror server-side XP formula for a live estimate (shown during the session)
  const estimatedXp = (() => {
    const levelMultipliers: Record<string, number> = { a1: 1.0, a2: 1.25, b1: 1.6, b2: 2.0 };
    const lm = levelMultipliers[session.recommendedLevel] ?? 1;
    const acc = fixedQuestionCount > 0 ? score / fixedQuestionCount : 0;
    const baseXp = 16 + fixedQuestionCount * 2;
    const bonus = acc >= 0.9 ? 8 : acc >= 0.75 ? 4 : 0;
    const penalty = (acc < 0.5 ? 6 : 0) + totalMistakes * 2 + hintsUsed + revealedAnswers * 3;
    return Math.max(4, Math.round(baseXp * lm + bonus - penalty));
  })();
  const progress = Math.round((currentStep / fixedQuestionCount) * 100);
  const builtWords = question.type === "build_sentence" || question.type === "dictation_sentence"
    ? selectedTokenIndexes.map((idx: number) => question.tokens?.[idx] || "")
    : [];
  const builtSentence = joinBuiltWords(question, selectedTokenIndexes);
  const buildAnswerText = (question.type === "build_sentence" || question.type === "dictation_sentence")
    ? String(question.answer || "").trim()
    : "";
  const buildNextHintWordIndex = (() => {
    if (buildHintCount < 2 || !buildAnswerText) return undefined;
    const answerWords = splitSentenceWords(buildAnswerText);
    const nextWord = answerWords[selectedTokenIndexes.length];
    if (!nextWord) return undefined;
    const tokens = (question.type === "build_sentence" || question.type === "dictation_sentence")
      ? question.tokens
      : [];
    const usedIndexes = new Set(selectedTokenIndexes);
    return tokens.findIndex((t, i) =>
      normalizeHintToken(t) === normalizeHintToken(nextWord) && !usedIndexes.has(i)
    );
  })();
  const primaryHint = Array.isArray(question.hints) ? question.hints[0] : "";
  const roleplayHintText = question.answerEnglish || question.hints?.[1] || "";
  const showEssentialHint = Boolean(primaryHint) &&
    question.type !== "build_sentence" &&
    question.type !== "dictation_sentence" &&
    question.type !== "roleplay";
  const snapshot: SessionSnapshot = {
    questionsQueue,
    fixedQuestionCount,
    index,
    score,
    selectedOption,
    selectedTokenIndexes,
    attemptLog,
    mistakeQuestionIds,
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
    matchingPromptOrder,
    matchingAnswerOrder
  };
  const {
    speechError,
    setSpeechError,
    playAudioUrl,
    speakText,
    startPronunciationCheck
  } = useSessionSpeech({
    language: session.language,
    onTranscriptCaptured: (transcript) => {
      setPronunciationTranscript(transcript);
      setSelectedOption(transcript);
      setFeedback(null);
    }
  });
  const {
    canSubmit,
    submitAnswer,
    submitFlashcard,
    skipPronunciationExercise,
    revealAnswer,
    handlePracticeWordPick,
    handleOptionSelect,
    handleTranscriptChange,
    handleRoleplayHint
  } = useSessionEngine({
    question,
    questionsQueue,
    index,
    score,
    fixedQuestionCount,
    totalMistakes,
    hintsUsed,
    revealedAnswers,
    selectedOption,
    selectedTokenIndexes,
    builtSentence,
    revealedCurrentQuestion,
    flashcardRevealed,
    pronunciationTranscript,
    practiceWordMatches,
    practiceSelection,
    practiceCompleted,
    matchingPairs,
    attemptLog,
    mistakeQuestionIds,
    successDelayMs: 900,
    onFinish,
    setIndex,
    setScore,
    setSelectedOption,
    setSelectedTokenIndexes,
    setAttemptLog,
    setMistakeQuestionIds,
    setFeedback,
    setRevealedCurrentQuestion,
    setRoleplayHintVisible,
    setQuestionMistakes,
    setTotalMistakes,
    setHintsUsed,
    setRevealedAnswers,
    setFlashcardRevealed,
    setPronunciationTranscript,
    setPracticeWordMatches,
    setPracticeSelection,
    setPracticeFeedback,
    setPracticeLeftOrder,
    setPracticeRightOrder,
    setMatchingPairs,
    setMatchingPromptOrder,
    setMatchingAnswerOrder,
    markPracticeCompleted: () => setPracticeCompleted(true),
    resetPracticeCompleted: () => setPracticeCompleted(false),
    clearSpeechError: () => setSpeechError("")
  });

  useEffect(() => {
    setBuildHintCount(0);
    setSpeechError("");
  }, [question?.id]);

  useEffect(() => {
    if (question?.type !== "matching") return;
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
      const prompts = pairs.map((pair) => pair.prompt || "").filter(Boolean);
      const answers = pairs.map((pair) => pair.answer || "").filter(Boolean);
    setMatchingPromptOrder(shuffleArray(prompts));
    setMatchingAnswerOrder(shuffleArray(answers));
  }, [question?.id, question?.type]);

  useEffect(() => {
    if (question?.type !== "practice_words") return;
    const pairs = Array.isArray(question.pairs) ? question.pairs : [];
    const lefts = pairs.map((pair) => pair.left || "").filter(Boolean);
    const rights = pairs.map((pair) => pair.right || "").filter(Boolean);
    setPracticeLeftOrder(shuffleArray(lefts));
    setPracticeRightOrder(shuffleArray(rights));
    setPracticeWordMatches([]);
    setPracticeSelection({ left: "", right: "" });
    setPracticeFeedback("");
    setPracticeCompleted(false);
  }, [question?.id, question?.type]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.repeat) return;

      const optionQuestion = (
        question.type === "mc_sentence" ||
        question.type === "dialogue_turn" ||
        question.type === "roleplay" ||
        question.type === "practice_listen"
      )
        ? question
        : question.type === "cloze_sentence"
          ? { options: question.clozeOptions || [] }
          : null;

      const hasOptions = optionQuestion && Array.isArray(optionQuestion.options);
      if (hasOptions && /^[1-4]$/.test(event.key)) {
        const optionIndex = Number(event.key) - 1;
        const option = optionQuestion.options[optionIndex];
        if (typeof option === "string" && option) {
          handleOptionSelect(option);
          event.preventDefault();
          return;
        }
      }

      if (event.key === "Enter" && canSubmit()) {
        submitAnswer();
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [question, canSubmit, handleOptionSelect, submitAnswer]);

  useSessionSnapshot({ snapshot, onSnapshot });

  function speakAlternative(text: string) {
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl);
      return;
    }
    speakText(text);
  }

  function speakBuildTranslationHint() {
    const translatedSentence = "answer" in question ? String(question.answer || "").trim() : "";
    if (!translatedSentence) return;
    setHintsUsed((value) => value + 1);
    setBuildHintCount((c) => c + 1);
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl);
      return;
    }
    speakText(translatedSentence);
  }

  function speakPronunciationTarget(playbackRate = 1) {
    const targetSentence = "answer" in question ? String(question.answer || "").trim() : "";
    if (!targetSentence) return;
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl, playbackRate);
      return;
    }
    speakText(targetSentence, Math.max(0.1, playbackRate));
  }

  function toggleToken(tokenIndex: number) {
    setSelectedTokenIndexes((prev) => {
      if (prev.includes(tokenIndex)) {
        return prev.filter((idx: number) => idx !== tokenIndex);
      }
      return [...prev, tokenIndex];
    });
    setFeedback(null);
  }

  function reorderSelectedWords(fromIndex: number, toIndex: number) {
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

  function removeSelectedWordAt(wordIndex: number) {
    setSelectedTokenIndexes((prev) => {
      if (wordIndex < 0 || wordIndex >= prev.length) return prev;
      const next = [...prev];
      next.splice(wordIndex, 1);
      return next;
    });
    setFeedback(null);
  }

  function handleBuiltWordDragStart(wordIndex: number) {
    draggedWordIndexRef.current = wordIndex;
    builtWordDropHandledRef.current = false;
  }

  function handleBuiltWordDrop(targetIndex: number) {
    const fromIndex = draggedWordIndexRef.current;
    if (!Number.isInteger(fromIndex)) return;
    builtWordDropHandledRef.current = true;
    reorderSelectedWords(Number(fromIndex), targetIndex);
    draggedWordIndexRef.current = null;
  }

  function applyMatchingAssignment(prompt: string, answer: string, fromPrompt = "") {
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

  function clearMatchingAssignment(prompt: string) {
    const normalizedPrompt = String(prompt || "");
    if (!normalizedPrompt) return;
    setMatchingPairs((prev) => prev.filter((pair) => pair.prompt !== normalizedPrompt));
    setFeedback(null);
  }

  function startMatchingDrag(event: DragEvent<HTMLElement>, answer: string, fromPrompt = "") {
    if (!event?.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ answer, fromPrompt }));
  }

  function readMatchingDragPayload(event: DragEvent<HTMLElement>): MatchingDragPayload | null {
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

  function toggleBookmark() {
    const qid = question.id;
    const isCurrentlyBookmarked = bookmarkedIds.has(qid);
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyBookmarked) next.delete(qid); else next.add(qid);
      return next;
    });
    const prompt = String(question.prompt || "");
    const answer = "answer" in question ? String(question.answer || "") : "";
    if (isCurrentlyBookmarked) {
      api.removeBookmark(qid).catch(() => {});
    } else {
      api.addBookmark({ questionId: qid, prompt, answer, language: session.language, category: session.categoryLabel }).catch(() => {});
    }
  }

  function handleBuiltWordDragEnd() {
    if (
      Number.isInteger(draggedWordIndexRef.current) &&
      !builtWordDropHandledRef.current
    ) {
      removeSelectedWordAt(Number(draggedWordIndexRef.current));
    }
    draggedWordIndexRef.current = null;
    builtWordDropHandledRef.current = false;
  }

  function handlePracticeListenAudio() {
    if (question.audioUrl) {
      playAudioUrl(question.audioUrl);
      return;
    }
    speakText("answer" in question ? String(question.answer || "") : "");
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
        {session.isDailyChallenge ? <span>Daily Challenge</span> : null}
        {session.isDailyChallenge && session.dailyChallengeDate ? (
          <span>{session.dailyChallengeDate}</span>
        ) : null}
        {question.type === "roleplay" ? <span>Roleplay</span> : null}
        <span>{currentStep}/{fixedQuestionCount}</span>
        <span className="session-xp-tally">~{estimatedXp} XP</span>
        <button
          type="button"
          className={`bookmark-btn${bookmarkedIds.has(question.id) ? " bookmarked" : ""}`}
          onClick={toggleBookmark}
          title="Save for review"
          aria-label={bookmarkedIds.has(question.id) ? "Remove bookmark" : "Save for review"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={bookmarkedIds.has(question.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>

      <div key={question.id} className="question-body">
      <h2>{question.prompt}</h2>
      {question.type === "roleplay" ? (
        <div className="build-hints">
          <button
            type="button"
            className="speak-button"
            onClick={handleRoleplayHint}
          >
            Hint: English Response
          </button>
          {roleplayHintVisible ? (
            <span className="hint-chip">{roleplayHintText}</span>
          ) : null}
        </div>
      ) : null}
      {question.type === "roleplay" && question.hints?.length ? (
        <div className="build-hints">
          <span className="hint-chip">{question.hints[0]}</span>
        </div>
      ) : null}
      {showEssentialHint ? (
        <div className="build-hints">
          <span className="hint-chip">{primaryHint}</span>
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
        <MultipleChoicePanel
          options={question.options || []}
          selectedOption={selectedOption}
          onSelect={handleOptionSelect}
          onSpeakOption={speakAlternative}
          withSpeakButton
        />
      ) : null}

      {question.type === "practice_listen" ? (
        <MultipleChoicePanel
          options={question.options || []}
          selectedOption={selectedOption}
          onSelect={handleOptionSelect}
        />
      ) : null}

      {question.type === "cloze_sentence" ? (
        <ClozeSentencePanel
          question={question}
          selectedOption={selectedOption}
          onSelect={handleOptionSelect}
        />
      ) : null}

      {question.type === "build_sentence" ? (
        <BuildSentencePanel
          dictation={false}
          question={question}
          builtSentence={builtSentence}
          builtWords={builtWords}
          selectedTokenIndexes={selectedTokenIndexes}
          nextHintWordIndex={buildNextHintWordIndex}
          onHint={speakBuildTranslationHint}
          onTokenSelect={toggleToken}
          onBuiltWordDragStart={handleBuiltWordDragStart}
          onBuiltWordDrop={handleBuiltWordDrop}
          onBuiltWordDragEnd={handleBuiltWordDragEnd}
        />
      ) : null}
      {question.type === "dictation_sentence" ? (
        <BuildSentencePanel
          dictation
          question={question}
          builtSentence={builtSentence}
          builtWords={builtWords}
          selectedTokenIndexes={selectedTokenIndexes}
          nextHintWordIndex={buildNextHintWordIndex}
          onHint={speakBuildTranslationHint}
          onTokenSelect={toggleToken}
          onBuiltWordDragStart={handleBuiltWordDragStart}
          onBuiltWordDrop={handleBuiltWordDrop}
          onBuiltWordDragEnd={handleBuiltWordDragEnd}
        />
      ) : null}

      {question.type === "flashcard" ? (
        <FlashcardPanel
          question={question}
          flashcardRevealed={flashcardRevealed}
          onToggleReveal={() => setFlashcardRevealed((value: boolean) => !value)}
          onNeedReview={() => submitFlashcard("review")}
          onKnown={() => submitFlashcard("known")}
        />
      ) : null}

      {question.type === "matching" ? (
        <MatchingPanel
          question={question}
          matchingPromptOrder={matchingPromptOrder}
          matchingAnswerOrder={matchingAnswerOrder}
          matchingPairs={matchingPairs}
          onReadDragPayload={readMatchingDragPayload}
          onApplyAssignment={applyMatchingAssignment}
          onStartDrag={startMatchingDrag}
          onClearAssignment={clearMatchingAssignment}
        />
      ) : null}

      {question.type === "pronunciation" ? (
        <TranscriptExercisePanel
          transcript={pronunciationTranscript}
          onTranscriptChange={handleTranscriptChange}
          actionButtons={[
            <button key="play" className="speak-button" type="button" onClick={speakBuildTranslationHint}>
              Play Prompt
            </button>,
            <button key="check" className="ghost-button" type="button" onClick={startPronunciationCheck}>
              Start Pronunciation Check
            </button>,
            <button key="skip" className="ghost-button" type="button" onClick={skipPronunciationExercise}>
              Can&apos;t speak now
            </button>
          ]}
        />
      ) : null}

      {question.type === "practice_speak" ? (
        <TranscriptExercisePanel
          transcript={pronunciationTranscript}
          onTranscriptChange={handleTranscriptChange}
          actionButtons={[
            <button key="listen" className="speak-button" type="button" onClick={() => speakPronunciationTarget()}>
              Listen
            </button>,
            <button key="slow" className="speak-button" type="button" onClick={() => speakPronunciationTarget(0.70)}>
              Listen (slow)
            </button>,
            <button key="check" className="ghost-button" type="button" onClick={startPronunciationCheck}>
              Start Pronunciation Check
            </button>
          ]}
        />
      ) : null}

      {question.type === "practice_listen" ? (
        <AudioActionPanel onPlay={handlePracticeListenAudio} />
      ) : null}

      {question.type === "practice_words" ? (
        <PracticeWordsPanel
          question={question}
          practiceLeftOrder={practiceLeftOrder}
          practiceRightOrder={practiceRightOrder}
          practiceWordMatches={practiceWordMatches}
          practiceSelection={practiceSelection}
          practiceFeedback={practiceFeedback}
          onPick={handlePracticeWordPick}
        />
      ) : null}

      <FeedbackPanel
        feedback={feedback}
        builtWords={builtWords}
        onReveal={revealAnswer}
      />

      {question.type !== "practice_words" && question.type !== "flashcard" ? (
        <button
          className="primary-button"
          onClick={submitAnswer}
          disabled={!canSubmit()}
        >
          Check
        </button>
      ) : null}
      </div>
    </section>
  );
}
