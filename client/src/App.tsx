import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type AuthSuccessPayload,
  type AuthUser,
  type CommunityExercisePayload
} from "./api";
import contributeIcon from "./assets/icon-contribute.svg";
import learnIcon from "./assets/icon-learn.svg";
import practiceIcon from "./assets/icon-practice.svg";
import setupIcon from "./assets/icon-setup.svg";
import statsIcon from "./assets/icon-stats.svg";
import { AuthPage } from "./components/AuthPage";
import { ContributePage } from "./components/ContributePage";
import { LearnPage } from "./components/LearnPage";
import { PracticePage } from "./components/PracticePage";
import { SetupPage } from "./components/SetupPage";
import { StatsPage } from "./components/StatsPage";
import {
  useAppNavigation,
  type AuthMode
} from "./hooks/useAppNavigation";
import { useAuthenticatedAppData } from "./hooks/useAuthenticatedAppData";
import { useCourseSessionState } from "./hooks/useCourseSessionState";
import { useThemeMode } from "./hooks/useThemeMode";
import { appVersion } from "./version";
import {
  AUTH_PATHS,
  AUTH_TOKEN_STORAGE_KEY,
  type ThemeMode
} from "./constants";
import type {
  CourseCategory,
  LearnerSettings
} from "./types/course";
import type {
  ActiveSession,
  PracticeMode,
  SessionReport
} from "./types/session";

type MistakeReviewOffer = {
  language: string;
  session: ActiveSession;
};

type SharePlatformId = "x" | "whatsapp" | "facebook" | "telegram";

const SHARE_PLATFORMS: Array<{ id: SharePlatformId; label: string }> = [
  { id: "x", label: "Share on X" },
  { id: "whatsapp", label: "Share on WhatsApp" },
  { id: "facebook", label: "Share on Facebook" },
  { id: "telegram", label: "Share on Telegram" }
];

function ShareIcon({ platform }: { platform: SharePlatformId | "native" }) {
  if (platform === "x") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.9 3H22l-6.77 7.73L23 21h-6.1l-4.78-6.24L6.65 21H3.5l7.24-8.27L3 3h6.25l4.32 5.7L18.9 3Zm-1.06 16.2h1.7L8.33 4.7H6.5l11.34 14.5Z" />
      </svg>
    );
  }
  if (platform === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.52 3.48A11.9 11.9 0 0 0 12.03 0C5.4 0 0 5.4 0 12.04c0 2.12.56 4.2 1.62 6.03L0 24l6.12-1.6a12.02 12.02 0 0 0 5.91 1.5h.01c6.64 0 12.04-5.4 12.04-12.03 0-3.22-1.25-6.24-3.56-8.39Zm-8.49 18.4h-.01a9.96 9.96 0 0 1-5.07-1.4l-.37-.22-3.63.95.97-3.53-.24-.36a9.93 9.93 0 0 1-1.54-5.28c0-5.5 4.48-9.98 9.99-9.98a9.9 9.9 0 0 1 7.06 2.93 9.88 9.88 0 0 1 2.92 7.06c0 5.5-4.48 9.98-9.98 9.98Zm5.47-7.48c-.3-.15-1.77-.88-2.04-.98-.27-.1-.47-.15-.67.15-.2.3-.77.98-.94 1.18-.18.2-.35.22-.65.08-.3-.15-1.24-.46-2.36-1.47a8.86 8.86 0 0 1-1.63-2.03c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.08-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.13 4.54.72.3 1.28.48 1.71.62.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.98H7.9V12h2.54V9.8c0-2.5 1.49-3.88 3.77-3.88 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.62.77-1.62 1.56V12h2.76l-.44 2.9h-2.32v6.98A10 10 0 0 0 22 12Z" />
      </svg>
    );
  }
  if (platform === "telegram") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.78 15.17 9.4 20.6c.54 0 .78-.23 1.06-.5l2.54-2.42 5.27 3.86c.97.53 1.65.25 1.91-.9l3.47-16.24h.01c.3-1.42-.51-1.98-1.45-1.63L1.86 10.6c-1.39.54-1.37 1.31-.24 1.66l5.2 1.62L18.9 6.3c.57-.38 1.08-.17.65.2L9.78 15.17Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.35a3.05 3.05 0 0 0 0-1.7l6.7-3.35a3 3 0 1 0-.9-1.8c0 .18.02.35.05.52l-6.7 3.35a3 3 0 1 0 0 2.56l6.7 3.35A3 3 0 1 0 18 16Z" />
    </svg>
  );
}

export default function App() {
  const loginVisitTrackedRef = useRef(false);
  const [resetToken, setResetToken] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [sessionShareLine, setSessionShareLine] = useState("");
  const [mistakeReviewOffer, setMistakeReviewOffer] = useState<MistakeReviewOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const { themeMode, setThemeMode, activeTheme } = useThemeMode();
  const {
    activeCourseLanguage,
    setActiveCourseLanguage,
    activeSessionsByLanguage,
    setActiveSessionsByLanguage,
    clearActiveSession,
    clearAllActiveSessions,
    saveSessionSnapshot
  } = useCourseSessionState();
  const {
    authMode,
    setAuthMode,
    activePage,
    navigateToPage,
    navigateAuthMode
  } = useAppNavigation({ authenticated: Boolean(authUser) });
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
  const activeSession = activeCourseLanguage ? activeSessionsByLanguage[activeCourseLanguage] || null : null;
  const courseLanguages = useMemo(
    () => languages.filter((language) => language.id !== settings?.nativeLanguage),
    [languages, settings?.nativeLanguage]
  );

  async function switchCourseLanguage(nextLanguage: string) {
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
  }

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

  function handleNavigateAuthMode(nextMode: AuthMode) {
    navigateAuthMode(nextMode);
    if (nextMode !== "login") {
      setLoginFailureCount(0);
    }
    if (nextMode !== "resetPassword") {
      setResetToken("");
    }
  }

  async function onAuthSuccess(payload: AuthSuccessPayload) {
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
  }

  async function register(form: { displayName: string; email: string; password: string }) {
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
  }

  async function login(form: { email: string; password: string }) {
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
  }

  async function resendVerification(email: string) {
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
  }

  async function forgotPassword(email: string) {
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
  }

  async function resetPassword(form: { token: string; password: string }) {
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
  }

  function startGoogleOAuth() {
    if (typeof window === "undefined") return;
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    window.location.assign(api.getGoogleOAuthStartUrl());
  }

  function signOut() {
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
  }

  async function deleteAccount(form: { password: string; confirmDelete: boolean }) {
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
    setAuthMode("login");
    setAuthNotice("Account deleted successfully.");
    if (typeof window !== "undefined" && window.location.pathname !== AUTH_PATHS.login) {
      window.history.replaceState({}, "", AUTH_PATHS.login);
    }
  }

  async function saveSetup() {
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
  }

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
        count: 10
      });

      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel: category.label
        }
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
        mode
      });

      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel: category.label,
          practiceMode: mode
        }
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
        language: activeCourseLanguage
      });
      const categoryLabel = courseCategories.find((item) => item.id === session.category)?.label || "Daily Challenge";
      setActiveSessionsByLanguage((prev) => ({
        ...prev,
        [activeCourseLanguage]: {
          ...session,
          categoryLabel
        }
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
  }

  async function submitContribution(payload: CommunityExercisePayload) {
    const result = await api.contributeExercise(payload);
    setStatusMessage(result?.message || "Exercise submitted for moderation.");
    return result;
  }

  function startMistakeReview() {
    if (!mistakeReviewOffer) return;
    setActiveCourseLanguage(mistakeReviewOffer.language);
    setActiveSessionsByLanguage((prev) => ({
      ...prev,
      [mistakeReviewOffer.language]: mistakeReviewOffer.session
    }));
    setStatusMessage(`Reviewing ${mistakeReviewOffer.session.questions.length} mistakes.`);
    setMistakeReviewOffer(null);
    navigateToPage(mistakeReviewOffer.session.practiceMode ? "practice" : "learn");
  }

  async function copySessionSummary() {
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
  }

  function resolveShareUrl(): string {
    const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
    if (configured) return configured.replace(/\/$/, "");
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
    return "https://lingoflow.app";
  }

  function buildShareText(): string {
    const shareUrl = resolveShareUrl();
    return `I just finished a LingoFlow session: ${sessionShareLine}. Practice with me at ${shareUrl}`;
  }

  function buildShareUrl(platform: SharePlatformId): string {
    const text = encodeURIComponent(buildShareText());
    const pageUrl = encodeURIComponent(resolveShareUrl());
    if (platform === "x") {
      return `https://x.com/intent/tweet?text=${text}`;
    }
    if (platform === "whatsapp") {
      return `https://wa.me/?text=${text}`;
    }
    if (platform === "facebook") {
      return `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${text}`;
    }
    return `https://t.me/share/url?text=${text}`;
  }

  function shareToPlatform(platform: SharePlatformId) {
    if (!sessionShareLine) return;
    const url = buildShareUrl(platform);
    if (typeof window === "undefined") return;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      setStatusMessage(`Opened ${SHARE_PLATFORMS.find((item) => item.id === platform)?.label || "share link"}.`);
      return;
    }
    setStatusMessage("Could not open share link in this browser.");
  }

  async function shareWithNative() {
    if (!sessionShareLine) return;
    const shareUrl = resolveShareUrl();
    const shareText = buildShareText();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "LingoFlow Session",
          text: shareText,
          url: shareUrl
        });
        setStatusMessage("Share sheet opened.");
        return;
      } catch (_error) {
        await copySessionSummary();
        return;
      }
    }
    await copySessionSummary();
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

  async function updateContributionStatus(id: number, payload: { moderationStatus: "pending" | "approved" | "rejected" }) {
    const result = await api.updateCommunityContributionStatus(id, payload);
    setStatusMessage(result?.message || "Contribution updated.");
    return result;
  }

  const dailyProgressPercent = useMemo(() => {
    if (!settings || !progress) return 0;
    return Math.min(100, Math.round(((progress.todayXp || 0) / settings.dailyGoal) * 100));
  }, [settings, progress]);

  const topbarIdentity =
    authUser?.authProvider === "local"
      ? (authUser?.email || authUser?.displayName || "Learner")
      : (authUser?.displayName || authUser?.email || "Learner");
  const activeLanguageLabel = languages.find((item) => item.id === activeCourseLanguage)?.label || "Language";

  if (loading) {
    return <main className="app-shell">Loading LingoFlow...</main>;
  }

  if (!authUser) {
    return (
      <AuthPage
        mode={authMode}
        busy={authBusy}
        errorMessage={authError}
        noticeMessage={authNotice}
        showForgotPassword={loginFailureCount >= 1}
        resetToken={resetToken}
        onModeChange={handleNavigateAuthMode}
        onRegister={register}
        onLogin={login}
        onResendVerification={resendVerification}
        onForgotPassword={forgotPassword}
        onResetPassword={resetPassword}
        onGoogleOAuthStart={startGoogleOAuth}
      />
    );
  }

  const tabs = [
    { id: "learn", label: "Learn", icon: learnIcon },
    { id: "practice", label: "Practice", icon: practiceIcon },
    { id: "contribute", label: "Contribute", icon: contributeIcon },
    { id: "setup", label: "Setup", icon: setupIcon },
    { id: "stats", label: "Stats", icon: statsIcon }
  ] as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>LingoFlow</h1>
          <p className="topbar-subtitle">Focused daily language practice with adaptive challenges.</p>
        </div>
        <div className="topbar-meta">
          <div className="stats">
            <span>{topbarIdentity}</span>
            <span>Course: {activeLanguageLabel}</span>
            <span>Level: {progress?.learnerLevel ?? 1}</span>
            <span>XP: {progress?.totalXp ?? 0}</span>
            <span>Streak: {progress?.streak ?? 0}</span>
          </div>
          <div className="topbar-actions">
            <label className="theme-switcher">
              Course
              <select
                value={activeCourseLanguage}
                onChange={(event) => switchCourseLanguage(event.target.value)}
                aria-label="Active course language"
              >
                {courseLanguages.map((language) => (
                  <option key={language.id} value={language.id}>{language.label}</option>
                ))}
              </select>
            </label>
            <label className="theme-switcher">
              Theme
              <select
                value={themeMode}
                onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
                aria-label="Theme mode"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button className="ghost-button" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
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

      {mistakeReviewOffer ? (
        <div className="status">
          You have a mistake drill ready.
          <button className="ghost-button" onClick={startMistakeReview}>
            Review mistakes
          </button>
        </div>
      ) : null}

      {sessionShareLine ? (
        <section className="panel setup-preview">
          <h3>Session Share Card</h3>
          <p>{sessionShareLine}</p>
          <div className="share-actions">
            <button
              className="ghost-button share-icon-button"
              onClick={shareWithNative}
            >
              <ShareIcon platform="native" />
              <span>Share</span>
            </button>
            {SHARE_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                className="ghost-button share-icon-button"
                onClick={() => shareToPlatform(platform.id)}
              >
                <ShareIcon platform={platform.id} />
                <span>{platform.label}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeSession && activePage !== "learn" && activePage !== "practice" ? (
        <div className="status">
          Session paused in <strong>{activeSession.categoryLabel}</strong>.
          <button
            className="ghost-button"
            onClick={() => navigateToPage(activeSession.practiceMode ? "practice" : "learn")}
          >
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
          onStartDailyChallenge={startDailyChallenge}
          onFinishSession={finishSession}
          onExitSession={() => {
            if (!activeCourseLanguage) return;
            clearActiveSession(activeCourseLanguage);
          }}
          onSessionSnapshot={(snapshot) => saveSessionSnapshot(activeCourseLanguage, snapshot)}
          onOpenSetup={() => navigateToPage("setup")}
          onOpenStats={() => navigateToPage("stats")}
        />
      ) : null}

      {activePage === "practice" ? (
        <PracticePage
          courseCategories={courseCategories}
          activeSession={activeSession}
          onStartPractice={startPractice}
          onFinishSession={finishSession}
          onExitSession={() => {
            if (!activeCourseLanguage) return;
            clearActiveSession(activeCourseLanguage);
          }}
          onSessionSnapshot={(snapshot) => saveSessionSnapshot(activeCourseLanguage, snapshot)}
        />
      ) : null}

      {activePage === "contribute" ? (
        <ContributePage
          canModerateCommunityExercises={Boolean(authUser?.canModerateCommunityExercises)}
          activeCourseLanguage={activeCourseLanguage}
          courseCategories={courseCategories}
          onSubmitContribution={submitContribution}
          onLoadContributions={loadContributions}
          onUpdateContributionStatus={updateContributionStatus}
        />
      ) : null}

      {activePage === "setup" ? (
        <SetupPage
          languages={languages}
          settings={settings}
          draftSettings={draftSettings}
          authProvider={authUser?.authProvider}
          onDraftChange={(patch: Partial<LearnerSettings>) =>
            setDraftSettings((prev) => ({ ...prev, ...patch }))
          }
          onSave={saveSetup}
          onReset={() => setDraftSettings((settings ? { ...settings } : draftSettings))}
          onDeleteAccount={deleteAccount}
        />
      ) : null}

      {activePage === "stats" ? (
        <StatsPage
          activeTheme={activeTheme}
          settings={settings}
          progress={progress}
          courseCategories={courseCategories}
          statsData={statsData}
          progressOverview={progressOverview}
          languages={languages}
        />
      ) : null}

      <footer className="app-footer">Version {appVersion}</footer>
    </main>
  );
}
