import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { SessionPlayer } from "../components/SessionPlayer";

test("session player supports retry and reveal flow after repeated mistakes", async () => {
  const user = userEvent.setup();
  render(
    <SessionPlayer
      session={{
        language: "spanish",
        categoryLabel: "Essentials",
        recommendedLevel: "a1",
        questions: [
          {
            id: "q1",
            type: "build_sentence",
            prompt: "Build greeting",
            answer: "Hola amigo",
            acceptedAnswers: [],
            tokens: ["Hola", "adios", "amigo"]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={() => {}}
      onSnapshot={() => {}}
    />
  );

  await user.click(screen.getByRole("button", { name: "adios" }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(screen.getByText("Incorrect. Try again before moving on.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reveal Answer" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(screen.getByRole("button", { name: "Reveal Answer" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Reveal Answer" }));
  expect(screen.getByText("Answer revealed. Rebuild it and submit.")).toBeInTheDocument();
});

test("session progress stays anchored to the original session length", async () => {
  const user = userEvent.setup();
  render(
    <SessionPlayer
      session={{
        language: "spanish",
        categoryLabel: "Essentials",
        recommendedLevel: "a1",
        questions: [
          {
            id: "q1",
            type: "build_sentence",
            prompt: "Build greeting",
            answer: "Hola amigo",
            acceptedAnswers: [],
            tokens: ["Hola", "adios", "amigo"]
          },
          {
            id: "q2",
            type: "mc_sentence",
            prompt: "Pick thanks",
            answer: "Gracias",
            options: ["Gracias", "Hola"]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={() => {}}
      onSnapshot={() => {}}
    />
  );

  expect(screen.getByText("1/2")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "adios" }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  expect(screen.getByText("1/2")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "adios" }));
  await user.click(screen.getByRole("button", { name: "Hola" }));
  await user.click(screen.getByRole("button", { name: "amigo" }));
  await user.click(screen.getByRole("button", { name: "Check" }));

  expect(await screen.findByText("Pick thanks")).toBeInTheDocument();
  expect(screen.getByText("2/2")).toBeInTheDocument();
});

test("pronunciation accepts close transcripts", async () => {
  const user = userEvent.setup();
  const onFinish = vi.fn();
  render(
    <SessionPlayer
      session={{
        language: "english",
        categoryLabel: "Hobbies",
        recommendedLevel: "a1",
        questions: [
          {
            id: "p1",
            type: "pronunciation",
            prompt: "Say this out loud.",
            answer: "I relax by reading books.",
            acceptedAnswers: ["I relax by reading books"]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={onFinish}
      onSnapshot={() => {}}
    />
  );

  await user.type(screen.getByLabelText("Transcript"), "I relax by reading bokks");
  await user.click(screen.getByRole("button", { name: "Check" }));

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ score: 1, maxScore: 1 })
  );
});
