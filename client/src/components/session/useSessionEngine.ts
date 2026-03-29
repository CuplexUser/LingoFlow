import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  isPronunciationCloseEnough,
  normalizeSentence
} from "./sessionHelpers";
import type {
  BuildSentenceQuestion,
  FlashcardQuestion,
  MatchingQuestion,
  PracticeWordsQuestion,
  SessionAttempt,
  SessionFeedback,
  SessionQuestion,
  SessionReport
} from "../../types/session";

type MatchingPair = {
  prompt: string;
  answer: string;
};

type PracticeWordPair = {
  left: string;
  right: string;
};

type UseSessionEngineParams = {
  question: SessionQuestion;
  questionsQueue: SessionQuestion[];
  index: number;
  score: number;
  fixedQuestionCount: number;
  totalMistakes: number;
  hintsUsed: number;
  revealedAnswers: number;
  selectedOption: string;
  selectedTokenIndexes: number[];
  builtSentence: string;
  revealedCurrentQuestion: boolean;
  flashcardRevealed: boolean;
  pronunciationTranscript: string;
  practiceWordMatches: PracticeWordPair[];
  practiceSelection: PracticeWordPair;
  practiceCompleted: boolean;
  matchingPairs: MatchingPair[];
  attemptLog: SessionAttempt[];
  mistakeQuestionIds: string[];
  onFinish: (report: SessionReport) => void | Promise<void>;
  setIndex: Dispatch<SetStateAction<number>>;
  setScore: Dispatch<SetStateAction<number>>;
  setSelectedOption: Dispatch<SetStateAction<string>>;
  setSelectedTokenIndexes: Dispatch<SetStateAction<number[]>>;
  setAttemptLog: Dispatch<SetStateAction<SessionAttempt[]>>;
  setMistakeQuestionIds: Dispatch<SetStateAction<string[]>>;
  setFeedback: Dispatch<SetStateAction<SessionFeedback | null>>;
  setRevealedCurrentQuestion: Dispatch<SetStateAction<boolean>>;
  setRoleplayHintVisible: Dispatch<SetStateAction<boolean>>;
  setQuestionMistakes: Dispatch<SetStateAction<number>>;
  setTotalMistakes: Dispatch<SetStateAction<number>>;
  setHintsUsed: Dispatch<SetStateAction<number>>;
  setRevealedAnswers: Dispatch<SetStateAction<number>>;
  setFlashcardRevealed: Dispatch<SetStateAction<boolean>>;
  setPronunciationTranscript: Dispatch<SetStateAction<string>>;
  setPracticeWordMatches: Dispatch<SetStateAction<PracticeWordPair[]>>;
  setPracticeSelection: Dispatch<SetStateAction<PracticeWordPair>>;
  setPracticeFeedback: Dispatch<SetStateAction<string>>;
  setPracticeLeftOrder: Dispatch<SetStateAction<string[]>>;
  setPracticeRightOrder: Dispatch<SetStateAction<string[]>>;
  setMatchingPairs: Dispatch<SetStateAction<MatchingPair[]>>;
  setMatchingPromptOrder: Dispatch<SetStateAction<string[]>>;
  setMatchingAnswerOrder: Dispatch<SetStateAction<string[]>>;
  markPracticeCompleted: () => void;
  resetPracticeCompleted: () => void;
  clearSpeechError: () => void;
};

function isBuildSentenceQuestion(question: SessionQuestion): question is BuildSentenceQuestion {
  return question.type === "build_sentence" || question.type === "dictation_sentence";
}

function isFlashcardQuestion(question: SessionQuestion): question is FlashcardQuestion {
  return question.type === "flashcard";
}

function isMatchingQuestion(question: SessionQuestion): question is MatchingQuestion {
  return question.type === "matching";
}

function isPracticeWordsQuestion(question: SessionQuestion): question is PracticeWordsQuestion {
  return question.type === "practice_words";
}

export function useSessionEngine({
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
  markPracticeCompleted,
  clearSpeechError
}: UseSessionEngineParams) {
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
    if (isPracticeWordsQuestion(question)) {
      return practiceWordMatches.length === question.pairs.length;
    }
    if (isMatchingQuestion(question)) {
      const expectedPairs = question.pairs;
      return matchingPairs.length === expectedPairs.length &&
        expectedPairs.every((pair) => matchingPairs.some(
          (candidate) =>
            normalizeSentence(candidate.prompt) === normalizeSentence(pair.prompt) &&
            normalizeSentence(candidate.answer) === normalizeSentence(pair.answer)
        ));
    }
    const answerQuestion = question;
    if (!isBuildSentenceQuestion(answerQuestion) && answerQuestion.type !== "pronunciation" && answerQuestion.type !== "practice_speak") {
      return false;
    }
    const variants = [answerQuestion.answer, ...(answerQuestion.acceptedAnswers || [])].map((value) => normalizeSentence(value));
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
    if (isMatchingQuestion(question)) return matchingPairs.length === question.pairs.length;
    if (question.type === "practice_words") return false;
    return selectedTokenIndexes.length > 0;
  }

  function buildAttemptEntry(): SessionAttempt {
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
      matchingPairs: isMatchingQuestion(question) ? matchingPairs : [],
      practicePairs: isPracticeWordsQuestion(question) ? practiceWordMatches : []
    };
  }

  function goNext(nextAttemptLog: SessionAttempt[], nextScore: number) {
    if (index === questionsQueue.length - 1) {
      onFinish({
        attempts: nextAttemptLog,
        score: nextScore,
        maxScore: fixedQuestionCount,
        mistakes: totalMistakes,
        mistakeQuestionIds,
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
      setQuestionMistakes((currentMistakes) => {
        const nextMistakes = currentMistakes + 1;
        setTotalMistakes((value) => value + 1);
        setMistakeQuestionIds((value) =>
          value.includes(question.id) ? value : [...value, question.id]
        );
        if (question.type !== "roleplay") {
          setHintsUsed((value) => value + 1);
        }

        const answerWords = "answer" in question ? String(question.answer || "").split(" ").filter(Boolean) : [];
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
            isFlashcardQuestion(question)
              ? (question.type === "cloze_sentence" ? question.clozeAnswer : question.answer)
              : null
        });

        return nextMistakes;
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
    clearSpeechError();
    goNext(attemptLog, score);
  }

  function revealAnswer() {
    if (question.type === "roleplay") return;
    const answerWords = "answer" in question ? String(question.answer || "").split(" ").filter(Boolean) : [];
    if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
      setSelectedOption(String(question.answer || ""));
    } else if (question.type === "cloze_sentence") {
      setSelectedOption(String(question.clozeAnswer || ""));
    } else if (isFlashcardQuestion(question)) {
      setFlashcardRevealed(true);
    } else if (question.type === "pronunciation" || question.type === "practice_speak") {
      setPronunciationTranscript(String(question.answer || ""));
      setSelectedOption(String(question.answer || ""));
    } else if (isMatchingQuestion(question)) {
      setMatchingPairs(question.pairs.map((pair) => ({
        prompt: pair.prompt,
        answer: pair.answer
      })));
    } else {
      const usedIndexes = new Set();
      const orderedIndexes = answerWords
        .map((word) => {
          const tokenIndex = (isBuildSentenceQuestion(question) ? question.tokens : []).findIndex(
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

  function handlePracticeWordPick(side: "left" | "right", value: string) {
    setPracticeFeedback("");
    const selected = {
      left: side === "left" ? value : practiceSelection.left,
      right: side === "right" ? value : practiceSelection.right
    };
    setPracticeSelection(selected);
    if (!selected.left || !selected.right) return;
    if (!isPracticeWordsQuestion(question)) return;
    const correctPair = question.pairs.find((pair) =>
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

  function handleOptionSelect(option: string) {
    setSelectedOption(option);
    setFeedback(null);
  }

  function handleTranscriptChange(value: string) {
    setPronunciationTranscript(value);
    setSelectedOption(value);
    setFeedback(null);
  }

  function handleRoleplayHint() {
    setHintsUsed((value) => value + 1);
    setRoleplayHintVisible(true);
    setFeedback(null);
  }

  useEffect(() => {
    if (!isPracticeWordsQuestion(question)) return;
    if (!question.pairs.length) return;
    if (practiceWordMatches.length !== question.pairs.length) return;
    if (practiceCompleted) return;

    markPracticeCompleted();
    const attemptEntry = buildAttemptEntry();
    const nextAttemptLog = [...attemptLog, attemptEntry];
    setAttemptLog(nextAttemptLog);
    onFinish({
      attempts: nextAttemptLog,
      score,
      maxScore: fixedQuestionCount,
      mistakes: totalMistakes,
      mistakeQuestionIds,
      hintsUsed,
      revealedAnswers
    });
  }, [
    question,
    practiceWordMatches,
    practiceCompleted,
    attemptLog,
    score,
    fixedQuestionCount,
    totalMistakes,
    mistakeQuestionIds,
    hintsUsed,
    revealedAnswers,
    onFinish
  ]);

  return {
    canSubmit,
    submitAnswer,
    skipPronunciationExercise,
    revealAnswer,
    handlePracticeWordPick,
    handleOptionSelect,
    handleTranscriptChange,
    handleRoleplayHint
  };
}
