import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { KnowledgePage } from "../components/KnowledgePage";
import { CourseContext, type CourseContextValue } from "../context/CourseContext";
import { SessionContext, type SessionContextValue } from "../context/SessionContext";
import type { KnowledgeMap, KnowledgeSkill } from "../types/knowledge";

function skill(id: string, label: string, state: KnowledgeSkill["state"], fields: Partial<KnowledgeSkill> = {}): KnowledgeSkill {
  return {
    id,
    label,
    kind: "function",
    description: "",
    state,
    itemsSeen: 3,
    itemsTotal: 6,
    accuracy: 0.5,
    lastPracticedAt: null,
    dueCount: 0,
    ...fields
  };
}

const KNOWLEDGE: KnowledgeMap = {
  language: "spanish",
  levels: [
    {
      id: "a1",
      label: "A1",
      name: "Beginner",
      premium: false,
      skillsKnown: 1,
      skillsTotal: 3,
      units: [
        {
          category: "food_cooking",
          label: "Food & Cooking",
          skillCount: 2,
          abilities: {
            reading: { accuracy: 0.8, attempts: 10 },
            listening: { accuracy: null, attempts: 0 },
            speaking: { accuracy: null, attempts: 0 },
            writing: { accuracy: 0.6, attempts: 4 }
          },
          skills: [skill("food.ordering", "Ordering food", "known", { dueCount: 2 }), skill("food.eating", "What you eat", "weak")],
          lastExam: null
        },
        {
          category: "travel",
          label: "Travel",
          skillCount: 1,
          abilities: null,
          skills: [skill("travel.hotel", "At the hotel", "shaky")],
          lastExam: null
        }
      ]
    }
  ],
  weakest: [],
  strongest: [],
  dueForReview: []
};

function renderPage() {
  const practiceSkill = vi.fn();
  render(
    <CourseContext.Provider value={{ knowledge: KNOWLEDGE } as unknown as CourseContextValue}>
      <SessionContext.Provider value={{ practiceSkill } as unknown as SessionContextValue}>
        <KnowledgePage currentLevel="a1" />
      </SessionContext.Provider>
    </CourseContext.Provider>
  );
  return practiceSkill;
}

test("lists skills by unit with their state as a word", () => {
  renderPage();
  expect(screen.getByRole("heading", { name: "A1 Beginner" })).toBeTruthy();
  expect(screen.getByText("1 of 3 skills known")).toBeTruthy();
  const food = screen.getByRole("article", { name: "Food & Cooking" });
  expect(within(food).getByText("Known")).toBeTruthy();
  expect(within(food).getByText("Weak")).toBeTruthy();
  expect(within(food).getByText("3 of 6 phrases · 50% right · 2 due")).toBeTruthy();
});

test("filters narrow the list, and Practice starts a session of that skill", async () => {
  const practiceSkill = renderPage();
  await userEvent.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Shaky" }));
  expect(screen.queryByRole("article", { name: "Food & Cooking" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Practice At the hotel" }));
  expect(practiceSkill).toHaveBeenCalledWith({ id: "travel.hotel", label: "At the hotel", category: "travel" });
});
