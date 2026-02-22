const API_BASE = "http://localhost:4000/api";

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
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
