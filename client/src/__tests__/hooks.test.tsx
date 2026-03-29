import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useAppNavigation } from "../hooks/useAppNavigation";
import { useCourseSessionState } from "../hooks/useCourseSessionState";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    normalizeActiveSession: vi.fn(actual.normalizeActiveSession)
  };
});

describe("useAppNavigation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("navigates between authenticated pages", () => {
    window.history.replaceState({}, "", "/learn");

    const { result } = renderHook(() => useAppNavigation({ authenticated: true }));

    act(() => {
      result.current.navigateToPage("stats");
    });

    expect(window.location.pathname).toBe("/stats");
    expect(result.current.activePage).toBe("stats");
  });

  test("navigates auth mode paths for signed-out state", () => {
    window.history.replaceState({}, "", "/login");

    const { result } = renderHook(() => useAppNavigation({ authenticated: false }));

    act(() => {
      result.current.navigateAuthMode("forgotPassword");
    });

    expect(window.location.pathname).toBe("/forgot-password");
    expect(result.current.authMode).toBe("forgotPassword");
  });
});

describe("useCourseSessionState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("loads and normalizes legacy session storage", () => {
    window.localStorage.setItem("lingoflow_active_course_language", "spanish");
    window.localStorage.setItem("lingoflow_active_session", JSON.stringify({
      sessionId: "legacy-session",
      language: "spanish",
      category: "essentials",
      categoryLabel: "Essentials",
      recommendedLevel: "a1",
      questions: [
        {
          id: "q1",
          type: "practice_words",
          prompt: "Match each word",
          pairs: [{ left: "gato", right: "cat" }]
        }
      ]
    }));

    const { result } = renderHook(() => useCourseSessionState());

    expect(result.current.activeCourseLanguage).toBe("spanish");
    expect(result.current.activeSessionsByLanguage.spanish.questions[0].type).toBe("practice_words");
  });

  test("saves snapshots onto the active language session", () => {
    window.localStorage.setItem("lingoflow_active_course_language", "spanish");
    window.localStorage.setItem("lingoflow_active_sessions", JSON.stringify({
      spanish: {
        sessionId: "s1",
        language: "spanish",
        category: "essentials",
        categoryLabel: "Essentials",
        recommendedLevel: "a1",
        questions: [
          {
            id: "q1",
            type: "mc_sentence",
            prompt: "Choose thanks",
            answer: "Gracias",
            options: ["Gracias", "Hola"]
          }
        ]
      }
    }));

    const { result } = renderHook(() => useCourseSessionState());

    act(() => {
      result.current.saveSessionSnapshot("spanish", {
        questionsQueue: result.current.activeSessionsByLanguage.spanish.questions,
        fixedQuestionCount: 1,
        index: 0,
        score: 0,
        selectedOption: "Gracias",
        selectedTokenIndexes: [],
        attemptLog: [],
        mistakeQuestionIds: [],
        feedback: null,
        revealedCurrentQuestion: false,
        roleplayHintVisible: false,
        questionMistakes: 0,
        totalMistakes: 0,
        hintsUsed: 0,
        revealedAnswers: 0,
        flashcardRevealed: false,
        pronunciationTranscript: "",
        practiceWordMatches: [],
        practiceLeftOrder: [],
        practiceRightOrder: [],
        practiceSelection: { left: "", right: "" },
        practiceFeedback: "",
        matchingPairs: [],
        matchingPromptOrder: [],
        matchingAnswerOrder: []
      });
    });

    expect(result.current.activeSessionsByLanguage.spanish.resumeState?.selectedOption).toBe("Gracias");
  });
});
