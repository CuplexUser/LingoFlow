import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { StoryQuiz } from "../components/story/StoryQuiz";
import type { StoryCompletionResult, StoryQuestion } from "../types/story";

const QUESTIONS: StoryQuestion[] = [
  { stem: "Where does Anna live?", stemLang: "en", options: ["Rome", "Venice"], optionsLang: "en" },
  { stem: "What does she drink?", stemLang: "en", options: ["Tea", "Coffee"], optionsLang: "en" }
];

const RESULT: StoryCompletionResult = {
  ok: true,
  quizScore: 1,
  quizTotal: 2,
  perQuestion: [true, false],
  correctAnswers: [0, 1],
  explanations: ["She lives in Rome.", "She drinks coffee."],
  xpGained: 20,
  alreadyAwarded: false,
  todayXp: 20
};

describe("StoryQuiz", () => {
  it("requires every question answered before it can submit", async () => {
    const onSubmit = vi.fn();
    render(
      <StoryQuiz
        questions={QUESTIONS}
        result={null}
        submitting={false}
        onSubmit={onSubmit}
        onContinue={() => {}}
      />
    );

    const check = screen.getByRole("button", { name: /Check answers/ });
    expect(check).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Rome" }));
    expect(check).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Coffee" }));
    expect(check).toBeEnabled();

    await userEvent.click(check);
    expect(onSubmit).toHaveBeenCalledWith([0, 1]);
  });

  it("reveals the score, explanations, and a continue button after submission", async () => {
    const onContinue = vi.fn();
    render(
      <StoryQuiz
        questions={QUESTIONS}
        result={RESULT}
        submitting={false}
        onSubmit={() => {}}
        onContinue={onContinue}
      />
    );

    expect(screen.getByText("You got 1 of 2 right.")).toBeInTheDocument();
    expect(screen.getByText("She lives in Rome.")).toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: /See your reward/ });
    await userEvent.click(continueButton);
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });
});
