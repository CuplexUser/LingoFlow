import { AUTH_TOKEN_STORAGE_KEY } from "./constants";

type ApiRequestOptions = RequestInit & { headers?: Record<string, string> };

type ApiErrorPayload = {
  error?: string;
};

export type AuthUser = {
  id: number;
  email: string;
  displayName: string;
  emailVerified?: boolean;
  authProvider?: string;
};

export type AuthSuccessPayload = {
  token: string;
  user: AuthUser;
};

export type RegisterPayload = {
  displayName: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type VerifyEmailPayload = {
  token: string;
};

export type ResendVerificationPayload = {
  email: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

let authToken: string | null = null;

if (typeof window !== "undefined") {
  authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setAuthToken(token: string | null | undefined): void {
  authToken = token || null;
  if (typeof window === "undefined") return;
  if (authToken) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

function getAuthToken(): string | null {
  return authToken;
}

function clearAuthToken(): void {
  setAuthToken(null);
}

function getGoogleOAuthStartUrl(): string {
  return `${API_BASE}/auth/google/start`;
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message =
      (payload as ApiErrorPayload | null)?.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getGoogleOAuthStartUrl,
  register: (payload: RegisterPayload) =>
    request<{ ok: boolean; requiresEmailVerification?: boolean; message?: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  login: (payload: LoginPayload) =>
    request<AuthSuccessPayload>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  resendVerification: (payload: ResendVerificationPayload) =>
    request<{ ok: boolean; message?: string }>(
      "/auth/resend-verification",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  verifyEmail: (payload: VerifyEmailPayload) =>
    request<{ ok: boolean; message?: string }>(
      "/auth/verify-email",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  getMe: () => request<{ user: AuthUser }>("/auth/me"),
  getLanguages: () => request<Array<{ id: string; label: string }>>("/languages"),
  getCourse: (language: string) => request(`/course?language=${encodeURIComponent(language)}`),
  startSession: (payload: Record<string, unknown>) =>
    request("/session/start", { method: "POST", body: JSON.stringify(payload) }),
  getSettings: () => request("/settings"),
  saveSettings: (payload: Record<string, unknown>) =>
    request("/settings", { method: "PUT", body: JSON.stringify(payload) }),
  getProgress: (language?: string) =>
    request(`/progress${language ? `?language=${encodeURIComponent(language)}` : ""}`),
  getStats: (language?: string) =>
    request(`/stats${language ? `?language=${encodeURIComponent(language)}` : ""}`),
  completeSession: (payload: Record<string, unknown>) =>
    request("/session/complete", { method: "POST", body: JSON.stringify(payload) })
};
