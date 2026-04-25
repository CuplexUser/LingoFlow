import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import App from "../App";

const apiMock = vi.hoisted(() => ({
  getAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
  register: vi.fn(),
  login: vi.fn(),
  resendVerification: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  deleteAccount: vi.fn(),
  verifyEmail: vi.fn(),
  getGoogleOAuthStartUrl: vi.fn(() => "/api/auth/google/start"),
  trackLoginPageVisit: vi.fn(),
  getMe: vi.fn(),
  getLanguages: vi.fn(),
  getSettings: vi.fn(),
  getCourse: vi.fn(),
  getProgress: vi.fn(),
  getProgressOverview: vi.fn(),
  getStats: vi.fn(),
  saveSettings: vi.fn(),
  startSession: vi.fn(),
  completeSession: vi.fn()
}));

vi.mock("../api", () => ({
  api: apiMock,
  normalizeActiveSession: vi.fn((session) => ({
    ...session,
    questions: Array.isArray(session?.questions) ? session.questions : []
  }))
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function setupApiFixtures() {
  window.localStorage.setItem("lingoflow_auth_token", "test-token");
  apiMock.getAuthToken.mockReturnValue("test-token");
  apiMock.trackLoginPageVisit.mockResolvedValue({ ok: true });
  apiMock.getMe.mockResolvedValue({
    user: {
      id: 2,
      email: "test@example.com",
      displayName: "Tester",
      authProvider: "local"
    }
  });
  const settings = {
    nativeLanguage: "english",
    targetLanguage: "spanish",
    dailyGoal: 30,
    dailyMinutes: 20,
    weeklyGoalSessions: 5,
    selfRatedLevel: "a1",
    learnerName: "Learner",
    learnerBio: "",
    focusArea: "travel"
  };
  apiMock.getLanguages.mockResolvedValue([
    { id: "english", label: "English" },
    { id: "spanish", label: "Spanish" }
  ]);
  apiMock.getSettings.mockResolvedValue(settings);
  apiMock.getCourse.mockResolvedValue([
    {
      id: "essentials",
      label: "Essentials",
      description: "Core",
      totalPhrases: 12,
      levels: ["a1", "a2", "b1", "b2"],
      mastery: 10,
      attempts: 0,
      accuracy: 80,
      levelUnlocked: "a1",
      unlocked: true,
      lockReason: ""
    },
    {
      id: "conversation",
      label: "Conversation",
      description: "Social",
      totalPhrases: 12,
      levels: ["a1", "a2", "b1", "b2"],
      mastery: 0,
      attempts: 0,
      accuracy: 0,
      levelUnlocked: "a1",
      unlocked: false,
      lockReason: "Practice Essentials a bit more to unlock this step."
    }
  ]);
  apiMock.getProgress.mockResolvedValue({
    totalXp: 20,
    todayXp: 10,
    streak: 2,
    learnerLevel: 1,
    lastCompletedDate: null,
    categories: []
  });
  apiMock.getStats.mockResolvedValue({
    completionPercent: 12,
    accuracyPercent: 88,
    masteredCount: 0,
    categoryCount: 1,
    streak: 2,
    sessionsLast7Days: 3,
    weeklyGoalProgress: 60,
    weeklyGoalSessions: 5,
    weakestCategories: ["essentials"],
    objectiveStats: [{ objective: "grammar-a1", accuracy: 55 }],
    errorTypeTrend: [{ errorType: "word_order", count: 4 }]
  });
  apiMock.getProgressOverview.mockResolvedValue({
    totalXp: 20,
    languages: [
      {
        language: "spanish",
        totalXp: 20,
        todayXp: 10,
        streak: 2,
        learnerLevel: 1,
        lastCompletedDate: null
      }
    ]
  });
  apiMock.saveSettings.mockImplementation(async (payload) => payload);
  apiMock.deleteAccount.mockResolvedValue({ ok: true, message: "Account deleted." });
}

async function completeSessionAndShowShareCard(user) {
  setupApiFixtures();
  apiMock.completeSession.mockResolvedValue({
    evaluated: {
      score: 1,
      maxScore: 1,
      mistakes: 0
    },
    xpGained: 130,
    mastery: 80,
    levelUnlocked: "b2",
    learnerLevel: 2
  });
  window.localStorage.setItem("lingoflow_active_session", JSON.stringify({
    sessionId: "s2",
    language: "spanish",
    category: "essentials",
    categoryLabel: "Essentials",
    recommendedLevel: "a1",
    questions: [
      {
        id: "q1",
        type: "mc_sentence",
        prompt: "Choose thanks",
        answer: "Gracias",
        options: ["Gracias", "Hola"]
      }
    ]
  }));

  render(<App />);
  await screen.findByText("Choose thanks");
  await user.click(screen.getByRole("button", { name: "Gracias" }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  await screen.findByText(/Session complete: 1\/1/);
}

test("setup page save and reset draft behavior", async () => {
  setupApiFixtures();
  const user = userEvent.setup();
  render(<App />);

  await screen.findByText("LingoFlow");
  await user.click(screen.getByRole("button", { name: "Setup" }));

  const nameInput = screen.getByLabelText("Your Name");
  await user.clear(nameInput);
  await user.type(nameInput, "Nora");
  await user.click(screen.getByRole("button", { name: "Save Setup" }));

  await waitFor(() => expect(apiMock.saveSettings).toHaveBeenCalled());
  const lastPayload = apiMock.saveSettings.mock.calls.at(-1)[0];
  expect(lastPayload.learnerName).toBe("Nora");

  await user.clear(nameInput);
  await user.type(nameInput, "Temp");
  await user.click(screen.getByRole("button", { name: "Reset Draft" }));
  expect(screen.getByLabelText("Your Name")).toHaveValue("Nora");
});

test("stats page renders fixture insights", async () => {
  setupApiFixtures();
  const user = userEvent.setup();
  render(<App />);

  await screen.findByText("LingoFlow");
  await user.click(screen.getByRole("button", { name: "Stats" }));

  expect(await screen.findByText("Focus next")).toBeInTheDocument();
  expect(screen.getByText("Grammar A1")).toBeInTheDocument();
  expect(screen.getByText("55%")).toBeInTheDocument();
  expect(screen.getByText("Word Order")).toBeInTheDocument();
});

test("setup page allows local users to delete account with password + confirmation", async () => {
  setupApiFixtures();
  const user = userEvent.setup();
  render(<App />);

  await screen.findByText("LingoFlow");
  await user.click(screen.getByRole("button", { name: "Setup" }));
  expect(await screen.findByText("Danger Zone")).toBeInTheDocument();

  const deleteButton = screen.getByRole("button", { name: "Delete Account" });
  expect(deleteButton).toBeDisabled();

  await user.type(screen.getByPlaceholderText("Enter your current password"), "Password123!");
  await user.click(screen.getByRole("checkbox", { name: /I understand this action is permanent/i }));
  expect(deleteButton).toBeEnabled();
  await user.click(deleteButton);

  await waitFor(() =>
    expect(apiMock.deleteAccount).toHaveBeenCalledWith({
      password: "Password123!",
      confirmDelete: true
    })
  );
  expect(await screen.findByText("Sign in to your account")).toBeInTheDocument();
  expect(screen.getByText("Account deleted successfully.")).toBeInTheDocument();
});

test("setup page hides in-app account deletion for oauth users", async () => {
  setupApiFixtures();
  apiMock.getMe.mockResolvedValueOnce({
    user: {
      id: 2,
      email: "oauth@example.com",
      displayName: "OAuth Tester",
      authProvider: "google"
    }
  });
  const user = userEvent.setup();
  render(<App />);

  await screen.findByText("LingoFlow");
  await user.click(screen.getByRole("button", { name: "Setup" }));
  expect(await screen.findByText("Danger Zone")).toBeInTheDocument();
  expect(screen.getByText("Account deletion in-app is available only for password-based accounts.")).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("Enter your current password")).not.toBeInTheDocument();
});

test("loads and resumes an active session from local storage", async () => {
  setupApiFixtures();
  window.localStorage.setItem("lingoflow_active_session", JSON.stringify({
    sessionId: "s1",
    language: "spanish",
    category: "essentials",
    categoryLabel: "Essentials",
    recommendedLevel: "a1",
    questions: [
      {
        id: "q1",
        type: "mc_sentence",
        prompt: "Select greeting",
        answer: "Hola",
        options: ["Hola", "Adios"]
      }
    ]
  }));

  render(<App />);

  expect(await screen.findByText("Select greeting")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Exit Session" })).toBeInTheDocument();
});

test("learn page shows recommended section and category cards", async () => {
  setupApiFixtures();
  render(<App />);

  await screen.findByText("Recommended next");
  expect(screen.getByRole("button", { name: /Start recommended session/i })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /Start|Continue/i }).length).toBeGreaterThan(0);
});

test("shows updated level-up style session status after completion", async () => {
  const user = userEvent.setup();
  await completeSessionAndShowShareCard(user);

  expect(screen.getByText(/\+130 XP/)).toBeInTheDocument();
  expect(screen.getByText(/Mastery 80.0% \(B2\)/)).toBeInTheDocument();
});

test("session share card opens platform share links", async () => {
  const openSpy = vi.spyOn(window, "open").mockReturnValue({ closed: false });
  const user = userEvent.setup();
  await completeSessionAndShowShareCard(user);

  await user.click(screen.getByRole("button", { name: "Share on X" }));
  await user.click(screen.getByRole("button", { name: "Share on WhatsApp" }));
  await user.click(screen.getByRole("button", { name: "Share on Facebook" }));
  await user.click(screen.getByRole("button", { name: "Share on Telegram" }));

  expect(openSpy).toHaveBeenCalledTimes(4);
  const openedUrls = openSpy.mock.calls.map((call) => String(call[0]));
  expect(openedUrls[0]).toContain("https://x.com/intent/tweet?text=");
  expect(openedUrls[1]).toContain("https://wa.me/?text=");
  expect(openedUrls[2]).toContain("https://www.facebook.com/sharer/sharer.php?");
  expect(openedUrls[3]).toContain("https://t.me/share/url?text=");
  expect(openedUrls[0]).toContain(encodeURIComponent("Practice with me at"));
});

test("session share card uses navigator.share when available", async () => {
  const shareMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: shareMock
  });

  const user = userEvent.setup();
  await completeSessionAndShowShareCard(user);

  await user.click(screen.getByRole("button", { name: "Share" }));

  expect(shareMock).toHaveBeenCalledTimes(1);
  expect(shareMock).toHaveBeenCalledWith(expect.objectContaining({
    text: expect.stringContaining("1/1 on Spanish Essentials B2"),
    url: expect.stringContaining("http://localhost")
  }));
  expect(await screen.findByText("Share sheet opened.")).toBeInTheDocument();
});

test("mistake review session completes locally without calling completeSession API", async () => {
  setupApiFixtures();
  const user = userEvent.setup();
  window.localStorage.setItem("lingoflow_active_session", JSON.stringify({
    sessionId: "mr-1",
    language: "spanish",
    category: "essentials",
    categoryLabel: "Essentials Mistake Review",
    recommendedLevel: "a1",
    isMistakeReview: true,
    questions: [
      {
        id: "q1",
        type: "mc_sentence",
        prompt: "Pick hello",
        answer: "Hola",
        options: ["Hola", "Adios"]
      }
    ]
  }));

  render(<App />);

  await screen.findByText("Pick hello");
  await user.click(screen.getByRole("button", { name: "Hola" }));
  await user.click(screen.getByRole("button", { name: "Check" }));

  expect(apiMock.completeSession).not.toHaveBeenCalled();
  expect(await screen.findByText("Mistake drill complete: 1/1.")).toBeInTheDocument();
});
