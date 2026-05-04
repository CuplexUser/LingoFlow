import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type Achievement,
  type Bookmark,
  type AuthSuccessPayload,
  type AuthUser,
  type CommunityExercisePayload
} from "./api";
import {
  useAppNavigation,
  type AuthMode
} from "./hooks/useAppNavigation";
import { useAuthenticatedAppData } from "./hooks/useAuthenticatedAppData";
import { useCourseSessionState } from "./hooks/useCourseSessionState";
import {
  AUTH_PATHS,
  AUTH_TOKEN_STORAGE_KEY
} from "./constants";
import type { CourseCategory } from "./types/course";
import type { PracticeMode, SessionReport } from "./types/session";
import { AuthContext, type AuthContextValue } from "./context/AuthContext";
import { NavigationContext, type NavigationContextValue } from "./context/NavigationContext";
import { CourseContext, type CourseContextValue } from "./context/CourseContext";
import { SessionContext, type SessionContextValue, type MistakeReviewOffer, type SharePlatformId } from "./context/SessionContext";

const SHARE_PLATFORMS: Array<{ id: SharePlatformId; label: string }> = [
  { id: "x", label: "Share on X" },
  { id: "whatsapp", label: "Share on WhatsApp" },
  { id: "facebook", label: "Share on Facebook" },
  { id: "telegram", label: "Share on Telegram" }
];

type AppProviderProps = {
  children: React.ReactNode;
};

export function AppProvider({ children }: AppProviderProps) {
  // ===== Auth state =====
  const loginVisitTrackedRef = useRef(false);
  const [resetToken, setResetToken] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // ===== Session state =====
  const [achievementUnlocks, setAchievementUnlocks] = useState<Achievement[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [sessionShareLine, setSessionShareLine] = useState("");
  const [mistakeReviewOffer, setMistakeReviewOffer] = useState<MistakeReviewOffer | null>(null);
  const {
    activeCourseLanguage,
    setActiveCourseLanguage,
    activeSessionsByLanguage,
    setActiveSessionsByLanguage,
    clearActiveSession,
    clearAllActiveSessions,
    saveSessionSnapshot
  } = useCourseSessionState();

  // ===== Navigation =====
  const {
    authMode,
    setAuthMode,
    activePage,
    navigateToPage,
    navigateAuthMode
  } = useAppNavigation({ authenticated: Boolean(authUser) });

  // ===== Course data =====
  const {
    languages,
    settings,
    draftSettings,
    progress,
    progressOverview,
    statsData,
    courseCategories,
    setSettings,
    setDraftSettings,
    hydrateAuthenticatedApp,
    refreshCourseAndProgress,
    resetAuthenticatedAppData
  } = useAuthenticatedAppData({
    activeCourseLanguage,
    setActiveCourseLanguage
  });
  const mistakeReviewCount = statsData?.mistakeReviewCount ?? 0;

  // ===== Bookmarks & contributions =====
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState("");
  const [pendingContributionCount, setPendingContributionCount] = useState(0);

  // ===== Computed values =====
  const activeSession = activeCourseLanguage ? activeSessionsByLanguage[activeCourseLanguage] || null : null;
  const courseLanguages = useMemo(
    () => languages.filter((language) => language.id !== settings?.nativeLanguage),
    [languages, settings?.nativeLanguage]
  );
  const activeLanguageLabel = languages.find((item) => item.id === activeCourseLanguage)?.label || "Language";

  // ===== Effects =====
  useEffect(() => {
    async function verifyEmailFromUrl() {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (url.pathname !== AUTH_PATHS.verifyEmail) return;

      const token = url.searchParams.get("token");
      if (!token) {
        setAuthError("Missing verification token.");
        window.history.replaceState({}, "", AUTH_PATHS.login);
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
      } catch (error: unknown) {
        setAuthError(error instanceof Error ? error.message : "Email verification failed.");
      } finally {
        setAuthBusy(false);
        window.history.replaceState({}, "", AUTH_PATHS.login);
      }
    }

    verifyEmailFromUrl();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.pathname !== AUTH_PATHS.resetPassword) return;
    const token = String(url.searchParams.get("token") || "").trim();
    setResetToken(token);
    setAuthMode("resetPassword");
    if (!token) {
      setAuthError("Missing password reset token.");
    }
  }, []);

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
    if (typeof window === "undefined") return;
    if (authUser) return;
    if (authMode !== "login") return;
    if (window.location.pathname !== AUTH_PATHS.login) return;
    if (loginVisitTrackedRef.current) return;

    loginVisitTrackedRef.current = true;
    api.trackLoginPageVisit().catch(() => {
      // Lightweight telemetry: avoid disturbing sign-in flow if this fails.
    });
  }, [authMode, authUser]);

  useEffect(() => {
    if (!authUser || !activeCourseLanguage) return;
    let cancelled = false;

    async function loadBookmarks() {
      const showLoading = activePage === "bookmarks";
      if (showLoading) {
        setBookmarksLoading(true);
      }
      setBookmarksError("");
      try {
        const data = await api.getBookmarks(activeCourseLanguage);
        if (cancelled) return;
        setBookmarks(data);
      } catch (_error) {
        if (cancelled) return;
        setBookmarks([]);
        setBookmarksError("Could not load bookmarks right now.");
      } finally {
        setBookmarksLoading(false);
      }
    }

    loadBookmarks();

    return () => {
      cancelled = true;
    };
  }, [authUser, activeCourseLanguage, activePage]);

  useEffect(() => {
    if (!authUser?.canModerateCommunityExercises) {
      setPendingContributionCount(0);
      return;
    }
    let cancelled = false;
    api.getPendingContributionCount()
      .then((data) => { if (!cancelled) setPendingContributionCount(data.count); })
      .catch(() => { /* silently ignore */ });
    return () => { cancelled = true; };
  }, [authUser]);

  // ===== Auth handlers =====

  const handleNavigateAuthMode = useCallback((nextMode: AuthMode) => {
    navigateAuthMode(nextMode);
    if (nextMode !== "login") {
      setLoginFailureCount(0);
    }
    if (nextMode !== "resetPassword") {
      setResetToken("");
    }
  }, [navigateAuthMode]);

  const onAuthSuccess = useCallback(async (payload: AuthSuccessPayload) => {
    if (!payload?.token || !payload?.user) {
      throw new Error("Authentication response is invalid");
    }
    api.setAuthToken(payload.token);
    setAuthUser(payload.user);
    setAuthError("");
    setAuthNotice("");
    setLoginFailureCount(0);
    setStatusMessage(`Welcome back, ${payload.user.displayName || "Learner"}!`);
    await hydrateAuthenticatedApp();
    navigateToPage("learn");
  }, [hydrateAuthenticatedApp, navigateToPage]);

  const register = useCallback(async (form: { displayName: string; email: string; password: string }) => {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.register(form);
      setAuthMode("login");
      setAuthNotice(
        payload?.message || "Account created. Check your email for a verification link before sign in."
      );
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Could not register.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const login = useCallback(async (form: { email: string; password: string }) => {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.login(form);
      await onAuthSuccess(payload);
    } catch (error: unknown) {
      setLoginFailureCount((prev) => prev + 1);
      setAuthError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }, [onAuthSuccess]);

  const resendVerification = useCallback(async (email: string) => {
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
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Could not resend verification email.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError("Enter your email to reset your password.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.forgotPassword({ email: normalizedEmail });
      setAuthNotice(
        payload?.message ||
        "If an account exists for this email, a password reset link has been sent."
      );
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Could not send password reset email.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const resetPassword = useCallback(async (form: { token: string; password: string }) => {
    const token = String(form?.token || "").trim();
    const password = String(form?.password || "");
    if (!token) {
      setAuthError("Missing password reset token.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.resetPassword({ token, password });
      setAuthMode("login");
      setResetToken("");
      setAuthNotice(payload?.message || "Password reset successful. You can sign in now.");
      if (window.location.pathname !== AUTH_PATHS.login) {
        window.history.replaceState({}, "", AUTH_PATHS.login);
      }
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const startGoogleOAuth = useCallback(() => {
    if (typeof window === "undefined") return;
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    window.location.assign(api.getGoogleOAuthStartUrl());
  }, []);

  const signOut = useCallback(() => {
    api.clearAuthToken();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("lingoflow_active_sessions");
      window.localStorage.removeItem("lingoflow_active_course_language");
      window.localStorage.removeItem("lingoflow_active_session");
    }
    setAuthUser(null);
    resetAuthenticatedAppData();
    setActiveCourseLanguage("");
    clearAllActiveSessions();
    setStatusMessage("You have signed out.");
    setSessionShareLine("");
    setMistakeReviewOffer(null);
    setAuthNotice("");
    setBookmarks([]);
    setBookmarksError("");
    setBookmarksLoading(false);
    setPendingContributionCount(0);
  }, [resetAuthenticatedAppData, clearAllActiveSessions]);

  const deleteAccount = useCallback(async (form: { password: string; confirmDelete: boolean }) => {
    await api.deleteAccount(form);
    api.clearAuthToken();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("lingoflow_active_sessions");
      window.localStorage.removeItem("lingoflow_active_course_language");
      window.localStorage.removeItem("lingoflow_active_session");
    }
    setAuthUser(null);
    resetAuthenticatedAppData();
    setActiveCourseLanguage("");
    clearAllActiveSessions();
    setStatusMessage("");
    setSessionShareLine("");
    setMistakeReviewOffer(null);
    setAuthError("");
    setBookmarks([]);
    setBookmarksError("");
    setBookmarksLoading(false);
    setAuthMode("login");
    setAuthNotice("Account deleted successfully.");
    if (typeof window !== "undefined" && window.location.pathname !== AUTH_PATHS.login) {
      window.history.replaceState({}, "", AUTH_PATHS.login);
    }
  }, [resetAuthenticatedAppData, clearAllActiveSessions]);

  // ===== Course handlers =====

  const switchCourseLanguage = useCallback(async (nextLanguage: string) => {
    const safeLanguage = String(nextLanguage || "").trim().toLowerCase();
    if (safeLanguage && safeLanguage === settings?.nativeLanguage) return;
    if (!safeLanguage || safeLanguage === activeCourseLanguage) return;
    try {
      setActiveCourseLanguage(safeLanguage);
      await refreshCourseAndProgress(safeLanguage);
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not switch course language right now.");
    }
  }, [settings?.nativeLanguage, activeCourseLanguage, refreshCourseAndProgress]);

  const saveSetup = useCallback(async () => {
    if (!settings) return;
    try {
      const saved = await api.saveSettings({ ...settings, ...draftSettings });
      setSettings(saved);
      const languageIds = new Set(
        (languages || [])
          .map((item) => item.id)
          .filter((id) => id !== saved.nativeLanguage)
      );
      const resolvedLanguage = languageIds.has(activeCourseLanguage)
        ? activeCourseLanguage
        : String(saved.targetLanguage || "spanish").toLowerCase();
      setActiveCourseLanguage(resolvedLanguage);
      setStatusMessage("Setup saved. Your learner profile has been updated.");
      await refreshCourseAndProgress(resolvedLanguage);
    } catch (_error) {
      setStatusMessage("Could not save setup changes.");
    }
  }, [settings, draftSettings, languages, activeCourseLanguage, refreshCourseAndProgress]);

  const submitContribution = useCallback(async (payload: CommunityExercisePayload) => {
    const result = await api.contributeExercise(payload);
    setStatusMessage(result?.message || "Exercise submitted for moderation.");
    return result;
  }, []);

  const loadContributions = useCallback((params: {
    scope?: "mine" | "all";
    status?: "pending" | "approved" | "rejected" | "changes_requested" | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => {
    return api.getCommunityContributions(params);
  }, []);

  const updateContributionStatus = useCallback(async (
    id: number,
    payload: { moderationStatus: "pending" | "approved" | "rejected" | "changes_requested"; reviewerComment?: string }
  ) => {
    const result = await api.updateCommunityContributionStatus(id, payload);
    setStatusMessage(result?.message || "Contribution updated.");
    if (authUser?.canModerateCommunityExercises) {
      api.getPendingContributionCount()
        .then((data) => setPendingContributionCount(data.count))
        .catch(() => { /* ignore */ });
    }
    return result;
  }, [authUser?.canModerateCommunityExercises]);

  const removeBookmark = useCallback(async (questionId: string) => {
    try {
      await api.removeBookmark(questionId);
      setBookmarks((prev) => prev.filter((item) => item.questionId !== questionId));
      setStatusMessage("Bookmark removed.");
    } catch (_error) {
      setStatusMessage("Could not remove bookmark.");
    }
  }, []);

  // ===== Session handlers =====

  const startCategory = useCallback(async (category: CourseCategory) => {
    if (!settings || !activeCourseLanguage) return;
    if (!category.unlocked) {
      setStatusMessage(category.lockReason || "This category is still locked.");
      return;
    }
    try {
      const session = await api.startSession({
        language: activeCourseLanguage,
        category: category.id,
        count: 10
      });
      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: { ...session, categoryLabel: category.label }
      }));
      setMistakeReviewOffer(null);
      navigateToPage("learn");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start session for this category.");
    }
  }, [settings, activeCourseLanguage, navigateToPage]);

  const startPractice = useCallback(async (mode: PracticeMode, category: CourseCategory) => {
    if (!settings || !activeCourseLanguage) return;
    if (!category) return;
    try {
      const session = await api.startSession({
        language: activeCourseLanguage,
        category: category.id,
        count: 10,
        mode
      });
      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: { ...session, categoryLabel: category.label, practiceMode: mode }
      }));
      setMistakeReviewOffer(null);
      navigateToPage("practice");
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not start a practice session.");
    }
  }, [settings, activeCourseLanguage, navigateToPage]);

  const startDailyChallenge = useCallback(async () => {
    if (!settings || !activeCourseLanguage) return;
    try {
      const session = await api.startDailyChallenge({ language: activeCourseLanguage });
      const categoryLabel = courseCategories.find((item) => item.id === session.category)?.label || "Daily Challenge";
      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: { ...session, categoryLabel }
      }));
      setMistakeReviewOffer(null);
      navigateToPage("learn");
      setStatusMessage("Daily challenge ready.");
    } catch (_error) {
      setStatusMessage("Could not load today's daily challenge.");
    }
  }, [settings, activeCourseLanguage, courseCategories, navigateToPage]);

  const finishSession = useCallback(async (sessionReport: SessionReport) => {
    if (!activeSession || !settings) return;
    try {
      const completedSession = activeSession;
      if (completedSession.isMistakeReview) {
        const finalScore = Number(sessionReport.score || 0);
        const maxScore = Number(sessionReport.maxScore || completedSession.questions.length || 0);
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
        revealedAnswers: sessionReport.revealedAnswers
      });
      const languageLabel = languages.find((item) => item.id === completedSession.language)?.label || completedSession.language;
      const streak = result.streak ?? progress?.streak ?? 0;
      const summaryLine = `${result.evaluated.score}/${result.evaluated.maxScore} on ${languageLabel} ${completedSession.categoryLabel} ${result.levelUnlocked.toUpperCase()} · ${streak} day streak`;
      setSessionShareLine(summaryLine);
      setStatusMessage(
        `Session complete: ${result.evaluated.score}/${result.evaluated.maxScore} ` +
        `(mistakes: ${result.evaluated.mistakes}). +${result.xpGained} XP. ` +
        `Mastery ${result.mastery.toFixed(1)}% (${result.levelUnlocked.toUpperCase()})`
      );
      if (result.unlockedAchievements && result.unlockedAchievements.length > 0) {
        setAchievementUnlocks(result.unlockedAchievements);
      }
      setActiveSessionsByLanguage((prev) => {
        const next = { ...prev };
        delete next[completedSession.language];
        return next;
      });
      const mistakeIds = Array.from(new Set(sessionReport.mistakeQuestionIds || []));
      const wrongQuestions = completedSession.questions.filter((question) => mistakeIds.includes(question.id));
      if (wrongQuestions.length) {
        setMistakeReviewOffer({
          language: completedSession.language,
          session: {
            ...completedSession,
            sessionId: `${completedSession.sessionId}-mistake-review-${Date.now()}`,
            categoryLabel: `${completedSession.categoryLabel} Mistake Review`,
            isMistakeReview: true,
            questions: wrongQuestions,
            resumeState: undefined
          }
        });
      } else {
        setMistakeReviewOffer(null);
      }
      await refreshCourseAndProgress(completedSession.language);
    } catch (_error) {
      setStatusMessage("Could not save session progress.");
    }
  }, [activeSession, settings, languages, progress, refreshCourseAndProgress]);

  const startMistakeReview = useCallback(() => {
    if (!mistakeReviewOffer) return;
    setActiveCourseLanguage(mistakeReviewOffer.language);
    setActiveSessionsByLanguage((prev) => ({
      ...prev,
      [mistakeReviewOffer.language]: mistakeReviewOffer.session
    }));
    setStatusMessage(`Reviewing ${mistakeReviewOffer.session.questions.length} mistakes.`);
    setMistakeReviewOffer(null);
    navigateToPage(mistakeReviewOffer.session.practiceMode ? "practice" : "learn");
  }, [mistakeReviewOffer, navigateToPage]);

  // ===== Share handlers =====

  const copySessionSummary = useCallback(async () => {
    if (!sessionShareLine) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setStatusMessage("Clipboard is unavailable in this browser.");
      return;
    }
    try {
      await navigator.clipboard.writeText(sessionShareLine);
      setStatusMessage("Session summary copied.");
    } catch (_error) {
      setStatusMessage("Could not copy session summary.");
    }
  }, [sessionShareLine]);

  const shareToPlatform = useCallback((platform: SharePlatformId) => {
    if (!sessionShareLine) return;
    const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
    const shareUrl = configured ? configured.replace(/\/$/, "") : (window.location?.origin || "https://lingoflow.app");
    const shareText = `I just finished a LingoFlow session: ${sessionShareLine}. Practice with me at ${shareUrl}`;
    const text = encodeURIComponent(shareText);
    const pageUrl = encodeURIComponent(shareUrl);
    const urlMap: Record<SharePlatformId, string> = {
      x: `https://x.com/intent/tweet?text=${text}`,
      whatsapp: `https://wa.me/?text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${text}`,
      telegram: `https://t.me/share/url?text=${text}`
    };
    const opened = window.open(urlMap[platform], "_blank", "noopener,noreferrer");
    if (opened) {
      setStatusMessage(`Opened ${SHARE_PLATFORMS.find((item) => item.id === platform)?.label || "share link"}.`);
      return;
    }
    setStatusMessage("Could not open share link in this browser.");
  }, [sessionShareLine]);

  const shareWithNative = useCallback(async () => {
    if (!sessionShareLine) return;
    const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
    const shareUrl = configured ? configured.replace(/\/$/, "") : (window.location?.origin || "https://lingoflow.app");
    const shareText = `I just finished a LingoFlow session: ${sessionShareLine}. Practice with me at ${shareUrl}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "LingoFlow Session", text: shareText, url: shareUrl });
        setStatusMessage("Share sheet opened.");
        return;
      } catch (_error) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(sessionShareLine).catch(() => {});
          setStatusMessage("Session summary copied.");
        }
        return;
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(sessionShareLine).catch(() => {});
      setStatusMessage("Session summary copied.");
    } else {
      setStatusMessage("Clipboard is unavailable in this browser.");
    }
  }, [sessionShareLine]);

  // ===== Context values (memoized so consumers only re-render when their slice changes) =====

  const authValue = useMemo<AuthContextValue>(() => ({
    authUser,
    authBusy,
    authError,
    authNotice,
    loginFailureCount,
    resetToken,
    loading,
    login,
    register,
    signOut,
    deleteAccount,
    forgotPassword,
    resetPassword,
    resendVerification,
    startGoogleOAuth,
    handleNavigateAuthMode
  }), [authUser, authBusy, authError, authNotice, loginFailureCount, resetToken, loading,
    login, register, signOut, deleteAccount, forgotPassword, resetPassword,
    resendVerification, startGoogleOAuth, handleNavigateAuthMode]);

  const navValue = useMemo<NavigationContextValue>(() => ({
    authMode,
    activePage,
    navigateToPage,
    navigateAuthMode
  }), [authMode, activePage, navigateToPage, navigateAuthMode]);

  const courseValue = useMemo<CourseContextValue>(() => ({
    languages,
    courseLanguages,
    settings,
    draftSettings,
    progress,
    progressOverview,
    statsData,
    courseCategories,
    bookmarks,
    bookmarksLoading,
    bookmarksError,
    pendingContributionCount,
    activeLanguageLabel,
    setDraftSettings,
    switchCourseLanguage,
    saveSetup,
    submitContribution,
    loadContributions,
    updateContributionStatus,
    removeBookmark
  }), [languages, courseLanguages, settings, draftSettings, progress, progressOverview,
    statsData, courseCategories, bookmarks, bookmarksLoading, bookmarksError,
    pendingContributionCount, activeLanguageLabel, setDraftSettings,
    switchCourseLanguage, saveSetup, submitContribution, loadContributions,
    updateContributionStatus, removeBookmark]);

  const clearAchievementUnlocks = useCallback(() => setAchievementUnlocks([]), []);

  const sessionValue = useMemo<SessionContextValue>(() => ({
    activeCourseLanguage,
    activeSession,
    mistakeReviewOffer,
    mistakeReviewCount,
    sessionShareLine,
    statusMessage,
    achievementUnlocks,
    clearAchievementUnlocks,
    startCategory,
    startPractice,
    startDailyChallenge,
    finishSession,
    startMistakeReview,
    copySessionSummary,
    shareToPlatform,
    shareWithNative,
    clearActiveSession,
    saveSessionSnapshot
  }), [activeCourseLanguage, activeSession, mistakeReviewOffer, mistakeReviewCount, sessionShareLine, statusMessage,
    achievementUnlocks, clearAchievementUnlocks,
    startCategory, startPractice, startDailyChallenge, finishSession, startMistakeReview,
    copySessionSummary, shareToPlatform, shareWithNative, clearActiveSession, saveSessionSnapshot]);

  return (
    <AuthContext.Provider value={authValue}>
      <NavigationContext.Provider value={navValue}>
        <CourseContext.Provider value={courseValue}>
          <SessionContext.Provider value={sessionValue}>
            {children}
          </SessionContext.Provider>
        </CourseContext.Provider>
      </NavigationContext.Provider>
    </AuthContext.Provider>
  );
}
