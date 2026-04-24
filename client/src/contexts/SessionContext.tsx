import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { api, type CommunityExercisePayload } from "../api";
import type {
  CourseCategory,
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
} from "../types/course";
import type {
  ActiveSession,
  PracticeMode,
  SessionReport,
  SessionSnapshot,
} from "../types/session";

export type MistakeReviewOffer = {
  language: string;
  session: ActiveSession;
};

export type SessionContextValue = {
  activeSession: ActiveSession | null;
  mistakeReviewOffer: MistakeReviewOffer | null;
  sessionShareLine: string;
  setMistakeReviewOffer: Dispatch<SetStateAction<MistakeReviewOffer | null>>;
  setSessionShareLine: Dispatch<SetStateAction<string>>;
  startCategory: (category: CourseCategory) => Promise<void>;
  startDailyChallenge: () => Promise<void>;
  startPractice: (mode: PracticeMode, category: CourseCategory) => Promise<void>;
  finishSession: (report: SessionReport) => Promise<void>;
  clearCurrentSession: () => void;
  saveCurrentSessionSnapshot: (snapshot: SessionSnapshot) => void;
  startMistakeReview: () => void;
  submitContribution: (
    payload: CommunityExercisePayload
  ) => Promise<{ message?: string }>;
  loadContributions: (params: {
    scope?: "mine" | "all";
    status?: "pending" | "approved" | "rejected" | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => Promise<unknown>;
  updateContributionStatus: (
    id: number,
    payload: { moderationStatus: "pending" | "approved" | "rejected" }
  ) => Promise<{ message?: string }>;
  removeBookmark: (questionId: string) => Promise<void>;
  saveSetup: () => Promise<void>;
  deleteAccount: (form: {
    password: string;
    confirmDelete: boolean;
  }) => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

type SessionProviderProps = {
  children: ReactNode;
  activeCourseLanguage: string;
  setActiveCourseLanguage: (language: string) => void;
  activeSessionsByLanguage: Record<string, ActiveSession>;
  setActiveSessionsByLanguage: Dispatch<
    SetStateAction<Record<string, ActiveSession>>
  >;
  clearActiveSession: (language: string) => void;
  saveSessionSnapshot: (language: string, snapshot: SessionSnapshot) => void;
  settings: LearnerSettings | null;
  progress: LearnerProgress | null;
  courseCategories: CourseCategory[];
  languages: LanguageOption[];
  navigateToPage: (page: string) => void;
  setStatusMessage: (msg: string) => void;
  refreshCourseAndProgress: (language: string) => Promise<void>;
  setSettings: (settings: LearnerSettings | null) => void;
  setBookmarks: Dispatch<SetStateAction<import("../api").Bookmark[]>>;
  setBookmarksError: Dispatch<SetStateAction<string>>;
  setBookmarksLoading: Dispatch<SetStateAction<boolean>>;
  resetAuthenticatedAppData: () => void;
  clearAllActiveSessions: () => void;
  setAuthMode: (mode: string) => void;
  handleDeleteAccount: (form: {
    password: string;
    confirmDelete: boolean;
  }) => Promise<void>;
};

export function SessionProvider({
  children,
  activeCourseLanguage,
  setActiveCourseLanguage,
  activeSessionsByLanguage,
  setActiveSessionsByLanguage,
  clearActiveSession,
  saveSessionSnapshot,
  settings,
  progress,
  courseCategories,
  languages,
  navigateToPage,
  setStatusMessage,
  refreshCourseAndProgress,
  setSettings,
  setBookmarks,
  setBookmarksError: _setBookmarksError,
  setBookmarksLoading: _setBookmarksLoading,
  resetAuthenticatedAppData: _resetAuthenticatedAppData,
  clearAllActiveSessions: _clearAllActiveSessions,
  setAuthMode: _setAuthMode,
  handleDeleteAccount,
}: SessionProviderProps) {
  const [mistakeReviewOffer, setMistakeReviewOffer] =
    useState<MistakeReviewOffer | null>(null);
  const [sessionShareLine, setSessionShareLine] = useState("");

  const activeSession = activeCourseLanguage
    ? activeSessionsByLanguage[activeCourseLanguage] || null
    : null;

  async function startCategory(category: CourseCategory) {
    if (!settings || !activeCourseLanguage) return;
    if (!category.unlocked) {
      setStatusMessage(category.lockReason || "This category is still locked.");
      return;
    }

    try {
      const session = await api.startSession({
        language: activeCourseLanguage,
        category: category.id,
        count: 10,
      });

      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel: category.label,
        },
      }));
      setMistakeReviewOffer(null);
      navigateToPage("learn");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start session for this category.");
    }
  }

  async function startPractice(mode: PracticeMode, category: CourseCategory) {
    if (!settings || !activeCourseLanguage) return;
    if (!category) return;

    try {
      const session = await api.startSession({
        language: activeCourseLanguage,
        category: category.id,
        count: 10,
        mode,
      });

      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel: category.label,
          practiceMode: mode,
        },
      }));
      setMistakeReviewOffer(null);
      navigateToPage("practice");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start a practice session.");
    }
  }

  async function startDailyChallenge() {
    if (!settings || !activeCourseLanguage) return;

    try {
      const session = await api.startDailyChallenge({
        language: activeCourseLanguage,
      });
      const categoryLabel =
        courseCategories.find((item) => item.id === session.category)?.label ||
        "Daily Challenge";
      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel,
        },
      }));
      setMistakeReviewOffer(null);
      navigateToPage("learn");
      setStatusMessage("Daily challenge ready.");
    } catch (_error) {
      setStatusMessage("Could not load today's daily challenge.");
    }
  }

  async function finishSession(sessionReport: SessionReport) {
    if (!activeSession || !settings) return;

    try {
      const completedSession = activeSession;
      if (completedSession.isMistakeReview) {
        const finalScore = Number(sessionReport.score || 0);
        const maxScore = Number(
          sessionReport.maxScore || completedSession.questions.length || 0
        );
        setStatusMessage(`Mistake drill complete: ${finalScore}/${maxScore}.`);
        setActiveSessionsByLanguage((prev) => {
          const next = { ...prev };
          delete next[completedSession.language];
          return next;
        });
        setMistakeReviewOffer(null);
        return;
      }
      const result = await api.completeSession({
        sessionId: completedSession.sessionId,
        language: completedSession.language,
        category: completedSession.category,
        attempts: sessionReport.attempts,
        hintsUsed: sessionReport.hintsUsed,
        revealedAnswers: sessionReport.revealedAnswers,
      });
      const languageLabel =
        languages.find((item) => item.id === completedSession.language)
          ?.label || completedSession.language;
      const categoryLabel = completedSession.categoryLabel;
      const streak = result.streak ?? progress?.streak ?? 0;
      const summaryLine = `${result.evaluated.score}/${result.evaluated.maxScore} on ${languageLabel} ${categoryLabel} ${result.levelUnlocked.toUpperCase()} · ${streak} day streak`;
      setSessionShareLine(summaryLine);

      setStatusMessage(
        `Session complete: ${result.evaluated.score}/${result.evaluated.maxScore} ` +
          `(mistakes: ${result.evaluated.mistakes}). +${result.xpGained} XP. ` +
          `Mastery ${result.mastery.toFixed(1)}% (${result.levelUnlocked.toUpperCase()})`
      );

      setActiveSessionsByLanguage((prev) => {
        const next = { ...prev };
        delete next[completedSession.language];
        return next;
      });
      const mistakeIds = Array.from(
        new Set(sessionReport.mistakeQuestionIds || [])
      );
      const wrongQuestions = completedSession.questions.filter((question) =>
        mistakeIds.includes(question.id)
      );
      if (wrongQuestions.length) {
        setMistakeReviewOffer({
          language: completedSession.language,
          session: {
            ...completedSession,
            sessionId: `${completedSession.sessionId}-mistake-review-${Date.now()}`,
            categoryLabel: `${completedSession.categoryLabel} Mistake Review`,
            isMistakeReview: true,
            questions: wrongQuestions,
            resumeState: undefined,
          },
        });
      } else {
        setMistakeReviewOffer(null);
      }
      await refreshCourseAndProgress(completedSession.language);
    } catch (_error) {
      setStatusMessage("Could not save session progress.");
    }
  }

  function clearCurrentSession() {
    if (!activeCourseLanguage) return;
    clearActiveSession(activeCourseLanguage);
  }

  function saveCurrentSessionSnapshot(snapshot: SessionSnapshot) {
    saveSessionSnapshot(activeCourseLanguage, snapshot);
  }

  function startMistakeReview() {
    if (!mistakeReviewOffer) return;
    setActiveCourseLanguage(mistakeReviewOffer.language);
    setActiveSessionsByLanguage((prev) => ({
      ...prev,
      [mistakeReviewOffer.language]: mistakeReviewOffer.session,
    }));
    setStatusMessage(
      `Reviewing ${mistakeReviewOffer.session.questions.length} mistakes.`
    );
    setMistakeReviewOffer(null);
    navigateToPage(
      mistakeReviewOffer.session.practiceMode ? "practice" : "learn"
    );
  }

  async function submitContribution(payload: CommunityExercisePayload) {
    const result = await api.contributeExercise(payload);
    setStatusMessage(result?.message || "Exercise submitted for moderation.");
    return result;
  }

  async function loadContributions(params: {
    scope?: "mine" | "all";
    status?: "pending" | "approved" | "rejected" | "";
    language?: string;
    category?: string;
    limit?: number;
  }) {
    return api.getCommunityContributions(params);
  }

  async function updateContributionStatus(
    id: number,
    payload: { moderationStatus: "pending" | "approved" | "rejected" }
  ) {
    const result = await api.updateCommunityContributionStatus(id, payload);
    setStatusMessage(result?.message || "Contribution updated.");
    return result;
  }

  async function removeBookmark(questionId: string) {
    try {
      await api.removeBookmark(questionId);
      setBookmarks((prev) =>
        prev.filter((item) => item.questionId !== questionId)
      );
      setStatusMessage("Bookmark removed.");
    } catch (_error) {
      setStatusMessage("Could not remove bookmark.");
    }
  }

  async function saveSetup() {
    if (!settings) return;

    try {
      const saved = await api.saveSettings({
        ...settings,
        ...(undefined as unknown as LearnerSettings), // placeholder for draftSettings
      });
      // This will be called from AppShell with the correct draftSettings
      setSettings(saved);
      setStatusMessage("Setup saved. Your learner profile has been updated.");
    } catch (_error) {
      setStatusMessage("Could not save setup changes.");
    }
  }

  async function deleteAccount(form: {
    password: string;
    confirmDelete: boolean;
  }) {
    await handleDeleteAccount(form);
  }

  return (
    <SessionContext.Provider
      value={{
        activeSession,
        mistakeReviewOffer,
        sessionShareLine,
        setMistakeReviewOffer,
        setSessionShareLine,
        startCategory,
        startDailyChallenge,
        startPractice,
        finishSession,
        clearCurrentSession,
        saveCurrentSessionSnapshot,
        startMistakeReview,
        submitContribution,
        loadContributions,
        updateContributionStatus,
        removeBookmark,
        saveSetup,
        deleteAccount,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
