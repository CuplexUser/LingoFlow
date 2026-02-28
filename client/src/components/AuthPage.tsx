import { useEffect, useState, type FormEvent } from "react";

type AuthMode = "login" | "register";

type AuthPageProps = {
  mode: AuthMode;
  busy: boolean;
  errorMessage: string;
  noticeMessage: string;
  onModeChange: (mode: AuthMode) => void;
  onRegister: (form: { displayName: string; email: string; password: string }) => Promise<void>;
  onLogin: (form: { email: string; password: string }) => Promise<void>;
  onResendVerification: (email: string) => Promise<void>;
  onGoogleOAuthStart: () => void;
};

export function AuthPage({
  mode,
  busy,
  errorMessage,
  noticeMessage,
  onModeChange,
  onRegister,
  onLogin,
  onResendVerification,
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
    await onLogin({
      email: form.email,
      password: form.password
    });
  }

  const shouldShowResend = mode === "login" &&
    String(errorMessage || "").toLowerCase().includes("verify your email");

  return (
    <main className="auth-shell">
      <section className="auth-card panel">
        <h1>LingoFlow</h1>
        <p className="subtitle">Sign in to sync your learning progress across devices.</p>

        <h2>{mode === "register" ? "Create your account" : "Sign in to your account"}</h2>

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

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="At least 8 characters"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={8}
              required
              disabled={busy}
            />
          </label>

          <button type="submit" className="primary-button" disabled={busy}>
            {busy
              ? "Please wait..."
              : mode === "register"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

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
