import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSpeedMatchPool = vi.fn();
const submitSpeedMatchScore = vi.fn();

vi.mock("../api", () => ({
  api: {
    getSpeedMatchPool: (...args: unknown[]) => getSpeedMatchPool(...args),
    submitSpeedMatchScore: (...args: unknown[]) => submitSpeedMatchScore(...args)
  }
}));

import { SpeedMatchGame } from "../components/SpeedMatchGame";

const PAIRS = [
  { prompt: "cat", answer: "gato" },
  { prompt: "dog", answer: "perro" },
  { prompt: "house", answer: "casa" },
  { prompt: "water", answer: "agua" },
  { prompt: "bread", answer: "pan" },
  { prompt: "milk", answer: "leche" }
];

describe("SpeedMatchGame", () => {
  beforeEach(() => {
    getSpeedMatchPool.mockReset();
    submitSpeedMatchScore.mockReset();
    getSpeedMatchPool.mockResolvedValue({ pairs: PAIRS, highscore: 0 });
    submitSpeedMatchScore.mockResolvedValue({ highscore: 3, isNewBest: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scores correct matches and submits the accumulated score when a run times out", async () => {
    render(<SpeedMatchGame language="spanish" onExit={() => {}} />);

    // Pool loads under real timers, then the intro screen appears.
    const start = await screen.findByText("Start");

    // Switch to fake timers before the run begins so its countdown is controllable.
    vi.useFakeTimers();
    fireEvent.click(start);

    // Match three pairs correctly (tap prompt, then its translation).
    for (const pair of PAIRS.slice(0, 3)) {
      fireEvent.click(screen.getByText(pair.prompt));
      fireEvent.click(screen.getByText(pair.answer));
    }

    // The running score reflects the three correct matches.
    expect(
      screen.getByText((_content, element) => element?.textContent === "Score 3")
    ).toBeTruthy();

    // Let the run timer expire before the remaining pairs are matched.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31000);
    });

    expect(submitSpeedMatchScore).toHaveBeenCalledWith("spanish", 3);
  });

  it("shows a not-enough-words message when the pool is too small", async () => {
    getSpeedMatchPool.mockResolvedValue({ pairs: PAIRS.slice(0, 2), highscore: 0 });
    render(<SpeedMatchGame language="spanish" onExit={() => {}} />);
    expect(await screen.findByText(/Not enough words yet/i)).toBeTruthy();
  });
});
