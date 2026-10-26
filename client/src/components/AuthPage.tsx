import { useEffect, useState, type FormEvent } from "react";
import { BrandMark } from "./BrandMark";

type AuthMode = "login" | "register" | "forgotPassword" | "resetPassword";

type AuthPageProps = {
  mode: AuthMode;
  busy: boolean;
  errorMessage: string;
  noticeMessage: string;
  showForgotPassword: boolean;
  resetToken?: string;
  onModeChange: (mode: AuthMode) => void;
  onRegister: (form: { displayName: string; email: string; password: string }) => Promise<void>;
  onLogin: (form: { email: string; password: string }) => Promise<void>;
  onResendVerification: (email: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  onResetPassword: (payload: { token: string; password: string }) => Promise<void>;
  onGoogleOAuthStart: () => void;
};

export function AuthPage({
  mode,
  busy,
  errorMessage,
  noticeMessage,
  showForgotPassword,
  resetToken = "",
  onModeChange,
  onRegister,
  onLogin,
  onResendVerification,
  onForgotPassword,
  onResetPassword,
  onGoogleOAuthStart
}: AuthPageProps) {
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: ""
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      password: ""
    }));
  }, [mode]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "register") {
      await onRegister({
        displayName: form.displayName,
        email: form.email,
        password: form.password
      });
      return;
    }
    if (mode === "forgotPassword") {
      await onForgotPassword(form.email);
      return;
    }
    if (mode === "resetPassword") {
      await onResetPassword({
        token: resetToken,
        password: form.password
      });
      return;
    }
    await onLogin({
      email: form.email,
      password: form.password
    });
  }

  const shouldShowResend = mode === "login" &&
    String(errorMessage || "").toLowerCase().includes("verify your email");

  const title = mode === "register"
    ? "Create your account"
    : mode === "forgotPassword"
      ? "Reset your password"
      : mode === "resetPassword"
        ? "Choose a new password"
        : "Sign in to your account";

  const lead = mode === "register"
    ? "Save your progress and pick up where you left off on any device."
    : mode === "forgotPassword"
      ? "Enter your email and we'll send you a link to choose a new password."
      : mode === "resetPassword"
        ? "Pick a password with at least 8 characters."
        : "Sign in to sync your learning progress across devices.";

  const showGoogle = mode === "login" || mode === "register";

  return (
    <main className="auth-shell">
      <section className="auth-card panel">
        <header className="auth-brand">
          <BrandMark size={56} />
          <h1>LingoFlow</h1>
          <p className="auth-tagline">Focused daily language practice</p>
        </header>

        <div className="auth-heading">
          <h2>{title}</h2>
          <p>{lead}</p>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === "register" ? (
            <label>
              Display Name
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, displayName: event.target.value }))
                }
                placeholder="How should we call you?"
                required
                disabled={busy}
              />
            </label>
          ) : null}

          {mode !== "resetPassword" ? (
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={busy}
              />
            </label>
          ) : null}

          {mode !== "forgotPassword" ? (
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="At least 8 characters"
                autoComplete={mode === "register" || mode === "resetPassword" ? "new-password" : "current-password"}
                minLength={8}
                required
                disabled={busy}
              />
            </label>
          ) : null}

          {mode === "login" && showForgotPassword ? (
            <button
              type="button"
              className="mode-link auth-forgot"
              onClick={() => onModeChange("forgotPassword")}
              disabled={busy}
            >
              Forgot your password?
            </button>
          ) : null}

          <button type="submit" className="primary-button" disabled={busy}>
            {busy
              ? "Please wait..."
              : mode === "register"
                ? "Create account"
                : mode === "forgotPassword"
                  ? "Send reset link"
                  : mode === "resetPassword"
                    ? "Reset password"
                    : "Sign in"}
          </button>
        </form>

        {noticeMessage ? <div className="status">{noticeMessage}</div> : null}

        {errorMessage ? <div className="feedback">{errorMessage}</div> : null}

        {shouldShowResend ? (
          <button
            type="button"
            className="ghost-button auth-wide"
            onClick={() => onResendVerification(form.email)}
            disabled={busy}
          >
            Resend verification email
          </button>
        ) : null}

        {showGoogle ? (
          <>
            <div className="auth-divider"><span>or</span></div>
            <button
              type="button"
              className="ghost-button auth-wide google-button"
              onClick={onGoogleOAuthStart}
              disabled={busy}
            >
              <GoogleLogo />
              Continue with Google
            </button>
          </>
        ) : null}

        <footer className="auth-footer">
          {showGoogle ? (
            <p>
              {mode === "register" ? "Already have an account?" : "New to LingoFlow?"}
              {" "}
              <button
                type="button"
                className="mode-link"
                onClick={() => onModeChange(mode === "register" ? "login" : "register")}
                disabled={busy}
              >
                {mode === "register" ? "Sign in" : "Create account"}
              </button>
            </p>
          ) : (
            <p>
              Remembered it?
              {" "}
              <button
                type="button"
                className="mode-link"
                onClick={() => onModeChange("login")}
                disabled={busy}
              >
                Back to sign in
              </button>
            </p>
          )}

          <p className="auth-legal">
            <a href="/about">About LingoFlow</a>
            <span aria-hidden="true">·</span>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a>
          </p>
        </footer>
      </section>
    </main>
  );
}

// Google's multicolor "G", as its sign-in branding guidelines ask for on the button.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
