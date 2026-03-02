import { useEffect, useState, type FormEvent } from "react";

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

  return (
    <main className="auth-shell">
      <section className="auth-card panel">
        <h1>LingoFlow</h1>
        <p className="subtitle">Sign in to sync your learning progress across devices.</p>

        <h2>{title}</h2>

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

        {mode === "login" || mode === "register" ? (
          <div className="google-auth">
            <div className="auth-divider"><span>or continue with</span></div>
            <button
              type="button"
              className="ghost-button google-placeholder"
              onClick={onGoogleOAuthStart}
              disabled={busy}
            >
              Continue with Google
            </button>
          </div>
        ) : null}

        {mode === "login" || mode === "register" ? (
          <p className="auth-mode-text">
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
        ) : null}

        {mode === "login" && showForgotPassword ? (
          <p className="auth-mode-text">
            Forgot your password?
            {" "}
            <button
              type="button"
              className="mode-link"
              onClick={() => onModeChange("forgotPassword")}
              disabled={busy}
            >
              Reset it
            </button>
          </p>
        ) : null}

        {mode === "forgotPassword" || mode === "resetPassword" ? (
          <p className="auth-mode-text">
            Back to sign in?
            {" "}
            <button
              type="button"
              className="mode-link"
              onClick={() => onModeChange("login")}
              disabled={busy}
            >
              Sign in
            </button>
          </p>
        ) : null}

        {noticeMessage ? <div className="status">{noticeMessage}</div> : null}

        {shouldShowResend ? (
          <div className="auth-resend-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onResendVerification(form.email)}
              disabled={busy}
            >
              Resend verification email
            </button>
          </div>
        ) : null}

        {errorMessage ? <div className="feedback">{errorMessage}</div> : null}
      </section>
    </main>
  );
}
