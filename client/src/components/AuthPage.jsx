import { useEffect, useRef, useState } from "react";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.accounts?.id) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export function AuthPage({
  mode,
  busy,
  errorMessage,
  noticeMessage,
  onModeChange,
  onRegister,
  onLogin,
  onGoogleLogin
}) {
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: ""
  });
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      password: ""
    }));
  }, [mode]);

  useEffect(() => {
    let mounted = true;
    if (!googleClientId) {
      setGoogleReady(false);
      return () => {
        mounted = false;
      };
    }

    loadGoogleScript().then((loaded) => {
      if (!mounted) return;
      setGoogleReady(Boolean(loaded && window.google?.accounts?.id));
    });

    return () => {
      mounted = false;
    };
  }, [googleClientId]);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current || !googleClientId || !window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (response?.credential) {
          await onGoogleLogin(response.credential);
        }
      }
    });

    googleButtonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: mode === "register" ? "signup_with" : "signin_with",
      shape: "pill",
      width: "320"
    });
  }, [googleReady, googleClientId, onGoogleLogin, mode]);

  async function onSubmit(event) {
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
          {googleClientId && googleReady ? (
            <div ref={googleButtonRef} />
          ) : googleClientId ? (
            <button type="button" className="ghost-button google-placeholder" disabled>
              Loading Google sign in...
            </button>
          ) : (
            <button type="button" className="ghost-button google-placeholder" disabled>
              Continue with Google (not configured)
            </button>
          )}
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

        {errorMessage ? <div className="feedback">{errorMessage}</div> : null}
      </section>
    </main>
  );
}
