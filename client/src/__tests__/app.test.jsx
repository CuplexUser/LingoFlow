import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import App from "../App";

const apiMock = vi.hoisted(() => ({
  getLanguages: vi.fn(),
  getSettings: vi.fn(),
  getCourse: vi.fn(),
  getProgress: vi.fn(),
  getStats: vi.fn(),
  saveSettings: vi.fn(),
  startSession: vi.fn(),
  completeSession: vi.fn()
}));

vi.mock("../api", () => ({
  api: apiMock
}));

function setupApiFixtures() {
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
      mastery: 10,
      attempts: 0,
      accuracy: 80,
      levelUnlocked: "a1",
      unlocked: true,
      lockReason: ""
    }
  ]);
  apiMock.getProgress.mockResolvedValue({
    totalXp: 20,
    todayXp: 10,
    streak: 2,
    hearts: 5,
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
  apiMock.saveSettings.mockImplementation(async (payload) => payload);
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

  expect(await screen.findByText("Focus Next")).toBeInTheDocument();
  expect(screen.getByText("Improve these categories next: essentials.")).toBeInTheDocument();
  expect(screen.getByText(/grammar-a1 \(55%\)/)).toBeInTheDocument();
  expect(screen.getByText(/word_order: 4/)).toBeInTheDocument();
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
