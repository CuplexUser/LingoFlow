import { describe, expect, test } from "vitest";
import { normalizeActiveSession } from "../api";

describe("normalizeActiveSession", () => {
  test("maps raw server session payloads to typed discriminated questions", () => {
    const normalized = normalizeActiveSession({
      sessionId: "s1",
      language: "swedish",
      category: "practice",
      categoryLabel: "Practice",
      recommendedLevel: "a1",
      questions: [
        {
          id: "m1",
          type: "matching",
          prompt: "Match the phrases",
          pairs: [
            { prompt: "hej", answer: "hello" }
          ]
        },
        {
          id: "c1",
          type: "cloze_sentence",
          prompt: "Fill the blank",
          clozeText: "Jag ___ kaffe.",
          clozeAnswer: "dricker",
          clozeOptions: ["dricker", "äter"]
        }
      ]
    });

    expect(normalized.questions[0].type).toBe("matching");
    expect(normalized.questions[1].type).toBe("cloze_sentence");
    if (normalized.questions[0].type === "matching") {
      expect(normalized.questions[0].pairs[0]).toEqual({ prompt: "hej", answer: "hello" });
    }
    if (normalized.questions[1].type === "cloze_sentence") {
      expect(normalized.questions[1].clozeOptions).toEqual(["dricker", "äter"]);
    }
  });
});
