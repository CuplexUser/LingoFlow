import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  api,
  type AuthSuccessPayload,
  type AuthUser,
} from "../api";
import { AUTH_PATHS, AUTH_TOKEN_STORAGE_KEY } from "../constants";
import type { AuthMode } from "../hooks/useAppNavigation";

export type AuthContextValue = {
  authUser: AuthUser | null;
  authBusy: boolean;
  authError: string;
  authNotice: string;
  loginFailureCount: number;
  resetToken: string;
  loading: boolean;
  handleLogin: (form: { email: string; password: string }) => Promise<void>;
  handleRegister: (form: {
    displayName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  handleLogout: () => void;
  handleGoogleAuth: () => void;
  handleForgotPassword: (email: string) => Promise<void>;
  handleResetPassword: (form: { token: string; password: string }) => Promise<void>;
  handleResendVerification: (email: string) => Promise<void>;
  handleDeleteAccount: (form: {
    password: string;
    confirmDelete: boolean;
  }) => Promise<void>;
  handleNavigateAuthMode: (nextMode: AuthMode) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

type AuthProviderProps = {
  children: ReactNode;
  setAuthMode: (mode: AuthMode) => void;
  navigateAuthMode: (mode: AuthMode) => void;
  navigateToPage: (page: string) => void;
  hydrateAuthenticatedApp: () => Promise<void>;
  resetAuthenticatedAppData: () => void;
  setActiveCourseLanguage: (language: string) => void;
  clearAllActiveSessions: () => void;
  setStatusMessage: (msg: string) => void;
  setSessionShareLine: (line: string) => void;
  setMistakeReviewOffer: (offer: null) => void;
  setBookmarks: (bookmarks: []) => void;
  setBookmarksError: (error: string) => void;
  setBookmarksLoading: (loading: boolean) => void;
};

export function AuthProvider({
  children,
  setAuthMode,
  navigateAuthMode,
  navigateToPage,
  hydrateAuthenticatedApp,
  resetAuthenticatedAppData,
  setActiveCourseLanguage,
  clearAllActiveSessions,
  setStatusMessage,
  setSessionShareLine,
  setMistakeReviewOffer,
  setBookmarks,
  setBookmarksError,
  setBookmarksLoading,
}: AuthProviderProps) {
  const loginVisitTrackedRef = useRef(false);
  const [resetToken, setResetToken] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [loginFailureCount, setLoginFailureCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Email verification from URL
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
        setAuthError(
          error instanceof Error ? error.message : "Email verification failed."
        );
      } finally {
        setAuthBusy(false);
        window.history.replaceState({}, "", AUTH_PATHS.login);
      }
    }

    verifyEmailFromUrl();
  }, []);

  // Reset token from URL
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

  // Auto-login from stored token / OAuth callback
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const oauthToken = String(
          url.searchParams.get("authToken") || ""
        ).trim();
        const oauthError = String(
          url.searchParams.get("authError") || ""
        ).trim();
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

  // Login page visit tracking
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authUser) return;
    // We read authMode indirectly from pathname to avoid needing it as a dependency
    if (window.location.pathname !== AUTH_PATHS.login) return;
    if (loginVisitTrackedRef.current) return;

    loginVisitTrackedRef.current = true;
    api.trackLoginPageVisit().catch(() => {
      // Lightweight telemetry
    });
  }, [authUser]);

  async function onAuthSuccess(payload: AuthSuccessPayload) {
    if (!payload?.token || !payload?.user) {
      throw new Error("Authentication response is invalid");
    }
    api.setAuthToken(payload.token);
    setAuthUser(payload.user);
    setAuthError("");
    setAuthNotice("");
    setLoginFailureCount(0);
    setStatusMessage(
      `Welcome back, ${payload.user.displayName || "Learner"}!`
    );
    await hydrateAuthenticatedApp();
    navigateToPage("learn");
  }

  async function handleRegister(form: {
    displayName: string;
    email: string;
    password: string;
  }) {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.register(form);
      setAuthMode("login");
      setAuthNotice(
        payload?.message ||
          "Account created. Check your email for a verification link before sign in."
      );
    } catch (error: unknown) {
      setAuthError(
        error instanceof Error ? error.message : "Could not register."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogin(form: { email: string; password: string }) {
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const payload = await api.login(form);
      await onAuthSuccess(payload);
    } catch (error: unknown) {
      setLoginFailureCount((prev) => prev + 1);
      setAuthError(
        error instanceof Error ? error.message : "Could not sign in."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResendVerification(email: string) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
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
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not resend verification email."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForgotPassword(email: string) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
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
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not send password reset email."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResetPassword(form: {
    token: string;
    password: string;
  }) {
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
      setAuthNotice(
        payload?.message || "Password reset successful. You can sign in now."
      );
      if (window.location.pathname !== AUTH_PATHS.login) {
        window.history.replaceState({}, "", AUTH_PATHS.login);
      }
    } catch (error: unknown) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not reset password."
      );
    } finally {
      setAuthBusy(false);
    }
  }

  function handleGoogleAuth() {
    if (typeof window === "undefined") return;
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    window.location.assign(api.getGoogleOAuthStartUrl());
  }

  function handleLogout() {
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
  }

  async function handleDeleteAccount(form: {
    password: string;
    confirmDelete: boolean;
  }) {
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
    if (
      typeof window !== "undefined" &&
      window.location.pathname !== AUTH_PATHS.login
    ) {
      window.history.replaceState({}, "", AUTH_PATHS.login);
    }
  }

  function handleNavigateAuthMode(nextMode: AuthMode) {
    navigateAuthMode(nextMode);
    if (nextMode !== "login") {
      setLoginFailureCount(0);
    }
    if (nextMode !== "resetPassword") {
      setResetToken("");
    }
  }

  return (
    <AuthContext.Provider
      value={{
        authUser,
        authBusy,
        authError,
        authNotice,
        loginFailureCount,
        resetToken,
        loading,
        handleLogin,
        handleRegister,
        handleLogout,
        handleGoogleAuth,
        handleForgotPassword,
        handleResetPassword,
        handleResendVerification,
        handleDeleteAccount,
        handleNavigateAuthMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
