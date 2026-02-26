import { AUTH_TOKEN_STORAGE_KEY } from "./constants";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

let authToken = null;

if (typeof window !== "undefined") {
  authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setAuthToken(token) {
  authToken = token || null;
  if (typeof window === "undefined") return;
  if (authToken) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

function getAuthToken() {
  return authToken;
}

function clearAuthToken() {
  setAuthToken(null);
}

async function request(path, options = {}) {
  const headers = {
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
    const message = payload?.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export const api = {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  verifyEmail: (payload) =>
    request("/auth/verify-email", { method: "POST", body: JSON.stringify(payload) }),
  loginWithGoogle: (payload) =>
    request("/auth/google", { method: "POST", body: JSON.stringify(payload) }),
  getMe: () => request("/auth/me"),
  getLanguages: () => request("/languages"),
  getCourse: (language) => request(`/course?language=${encodeURIComponent(language)}`),
  startSession: (payload) => request("/session/start", { method: "POST", body: JSON.stringify(payload) }),
  getSettings: () => request("/settings"),
  saveSettings: (payload) => request("/settings", { method: "PUT", body: JSON.stringify(payload) }),
  getProgress: (language) =>
    request(`/progress${language ? `?language=${encodeURIComponent(language)}` : ""}`),
  getStats: (language) =>
    request(`/stats${language ? `?language=${encodeURIComponent(language)}` : ""}`),
  completeSession: (payload) =>
    request("/session/complete", { method: "POST", body: JSON.stringify(payload) })
};
