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

test("practice speak accepts close transcripts", async () => {
  const user = userEvent.setup();
  const onFinish = vi.fn();
  render(
    <SessionPlayer
      session={{
        language: "english",
        categoryLabel: "Practice",
        recommendedLevel: "a1",
        questions: [
          {
            id: "ps1",
            type: "practice_speak",
            prompt: "Pronounce the phrase.",
            answer: "I read books.",
            acceptedAnswers: ["I read books"]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={onFinish}
      onSnapshot={() => {}}
    />
  );

  await user.type(screen.getByLabelText("Transcript"), "I read bokks");
  await user.click(screen.getByRole("button", { name: "Check" }));

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ score: 1, maxScore: 1 })
  );
  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({
      attempts: [
        expect.objectContaining({
          questionId: "ps1",
          textAnswer: "I read bokks"
        })
      ]
    })
  );
});

test("practice listen uses multiple choice selection", async () => {
  const user = userEvent.setup();
  const onFinish = vi.fn();
  render(
    <SessionPlayer
      session={{
        language: "english",
        categoryLabel: "Practice",
        recommendedLevel: "a1",
        questions: [
          {
            id: "pl1",
            type: "practice_listen",
            prompt: "Listen and choose.",
            answer: "I eat fruit.",
            options: ["I eat fruit.", "I read books.", "I play chess.", "I drink tea."]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={onFinish}
      onSnapshot={() => {}}
    />
  );

  await user.click(screen.getByRole("button", { name: "I eat fruit." }));
  await user.click(screen.getByRole("button", { name: "Check" }));

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ score: 1, maxScore: 1 })
  );
});

test("keyboard shortcuts select options and submit", async () => {
  const user = userEvent.setup();
  const onFinish = vi.fn();
  render(
    <SessionPlayer
      session={{
        language: "spanish",
        categoryLabel: "Essentials",
        recommendedLevel: "a1",
        questions: [
          {
            id: "k1",
            type: "mc_sentence",
            prompt: "Pick the greeting",
            answer: "Hola",
            options: ["Adios", "Hola", "Gracias", "Por favor"]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={onFinish}
      onSnapshot={() => {}}
    />
  );

  await user.keyboard("2");
  await user.keyboard("{Enter}");

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ score: 1, maxScore: 1 })
  );
});

test("practice words locks correct pairs and finishes when complete", async () => {
  const user = userEvent.setup();
  const onFinish = vi.fn();
  render(
    <SessionPlayer
      session={{
        language: "spanish",
        categoryLabel: "Practice",
        recommendedLevel: "a1",
        questions: [
          {
            id: "pw1",
            type: "practice_words",
            prompt: "Match each word to its translation.",
            pairs: [
              { left: "gato", right: "cat" },
              { left: "perro", right: "dog" }
            ]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={onFinish}
      onSnapshot={() => {}}
    />
  );

  await user.click(screen.getByRole("button", { name: "gato" }));
  await user.click(screen.getByRole("button", { name: "dog" }));
  expect(screen.getByText("Incorrect match. Try again.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "gato" }));
  await user.click(screen.getByRole("button", { name: "cat" }));
  expect(screen.getByText("Correct match.")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "perro" }));
  await user.click(screen.getByRole("button", { name: "dog" }));

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({ maxScore: 1 })
  );
});

test("revealed answers complete with zero score for that item", async () => {
  const user = userEvent.setup();
  const onFinish = vi.fn();
  render(
    <SessionPlayer
      session={{
        language: "spanish",
        categoryLabel: "Essentials",
        recommendedLevel: "a1",
        questions: [
          {
            id: "q-reveal",
            type: "build_sentence",
            prompt: "Build greeting",
            answer: "Hola amigo",
            acceptedAnswers: [],
            tokens: ["Hola", "adios", "amigo"]
          }
        ]
      }}
      onBack={() => {}}
      onFinish={onFinish}
      onSnapshot={() => {}}
    />
  );

  await user.click(screen.getByRole("button", { name: "adios" }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  await user.click(screen.getByRole("button", { name: "Check" }));
  await user.click(screen.getByRole("button", { name: "Reveal Answer" }));
  await user.click(screen.getByRole("button", { name: "Check" }));

  expect(onFinish).toHaveBeenCalledWith(
    expect.objectContaining({
      score: 0,
      maxScore: 1,
      mistakeQuestionIds: ["q-reveal"],
      attempts: expect.arrayContaining([
        expect.objectContaining({
          questionId: "q-reveal",
          revealed: true
        })
      ])
    })
  );
});
