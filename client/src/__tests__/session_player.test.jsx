import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
