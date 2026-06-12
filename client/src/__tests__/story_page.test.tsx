import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const getStories = vi.fn();
const getStory = vi.fn();
const completeStory = vi.fn();
const getSavedWords = vi.fn();
const fetchWordTranslations = vi.fn();
const saveWord = vi.fn();
const removeSavedWord = vi.fn();

vi.mock("../api", () => ({
  api: {
    getStories: (...args: unknown[]) => getStories(...args),
    getStory: (...args: unknown[]) => getStory(...args),
    completeStory: (...args: unknown[]) => completeStory(...args),
    getSavedWords: (...args: unknown[]) => getSavedWords(...args),
    fetchWordTranslations: (...args: unknown[]) => fetchWordTranslations(...args),
    saveWord: (...args: unknown[]) => saveWord(...args),
    removeSavedWord: (...args: unknown[]) => removeSavedWord(...args)
  }
}));

import { StoryPage } from "../components/StoryPage";

const STORY_A1 = {
  id: "ru-a1",
  language: "russian",
  level: "a1" as const,
  title: "Утро Анны",
  titleEn: "Anna's morning",
  theme: "Daily life",
  category: "essentials",
  sentences: [
    { target: "Анна живёт в Москве.", en: "Anna lives in Moscow." }
  ],
  glossary: {
    "анна": { g: "Anna", pos: "proper noun" },
    "москве": { g: "Moscow", pos: "noun · prepositional", note: "Prepositional case after в." }
  },
  culturalNote: { term: "Москва", body: "Russia's capital." }
};

const STORY_A2 = {
  ...STORY_A1,
  id: "ru-a2",
  level: "a2" as const,
  title: "На рынке",
  titleEn: "At the market",
  sentences: [{ target: "Анна купила хлеб.", en: "Anna bought bread." }],
  glossary: { "хлеб": { g: "bread", pos: "noun · masc." } },
  culturalNote: { term: "рынок", body: "Markets." }
};

const SUMMARIES = [
  { id: "ru-a1", language: "russian", level: "a1", title: "Утро Анны", titleEn: "Anna's morning", theme: "Daily life", category: "essentials", sentenceCount: 1 },
  { id: "ru-a2", language: "russian", level: "a2", title: "На рынке", titleEn: "At the market", theme: "Food", category: "food_cooking", sentenceCount: 1 }
];

beforeEach(() => {
  vi.clearAllMocks();
  getStories.mockResolvedValue(SUMMARIES);
  completeStory.mockResolvedValue({ ok: true });
  getSavedWords.mockResolvedValue([]);
  fetchWordTranslations.mockResolvedValue({});
  saveWord.mockResolvedValue({ ok: true, saved: true });
  removeSavedWord.mockResolvedValue({ ok: true, saved: false });
  getStory.mockImplementation((id: string) => Promise.resolve(id === "ru-a2" ? STORY_A2 : STORY_A1));
});

describe("StoryPage", () => {
  it("renders the first story for the active language", async () => {
    render(<StoryPage language="russian" languageLabel="Russian" />);
    // The title shows in the story heading (the library list repeats it as a span).
    expect(await screen.findByRole("heading", { name: "Утро Анны" })).toBeInTheDocument();
    expect(screen.getAllByText("Anna's morning").length).toBeGreaterThan(0);
    // English translations are hidden until toggled on.
    expect(screen.queryByText("Anna lives in Moscow.")).not.toBeInTheDocument();
  });

  it("opens the lookup drawer when a glossary word is tapped", async () => {
    render(<StoryPage language="russian" languageLabel="Russian" />);
    const word = await screen.findByRole("button", { name: /Москве — Moscow/ });
    await userEvent.click(word);

    const drawer = await screen.findByRole("dialog", { name: "Word lookup" });
    expect(within(drawer).getByText("Moscow")).toBeInTheDocument();
    expect(within(drawer).getByText("noun · prepositional")).toBeInTheDocument();
    expect(within(drawer).getByText("Prepositional case after в.")).toBeInTheDocument();
  });

  it("saves a word to review through the drawer", async () => {
    render(<StoryPage language="russian" languageLabel="Russian" />);
    const word = await screen.findByRole("button", { name: /Москве — Moscow/ });
    await userEvent.click(word);

    const saveButton = await screen.findByRole("button", { name: /Save to review/ });
    await userEvent.click(saveButton);

    await waitFor(() =>
      expect(saveWord).toHaveBeenCalledWith(
        expect.objectContaining({ language: "russian", word: "москве", translation: "Moscow", storyId: "ru-a1" })
      )
    );
    expect(await screen.findByRole("button", { name: /Saved to review/ })).toBeInTheDocument();
  });

  it("toggles the English translation", async () => {
    render(<StoryPage language="russian" languageLabel="Russian" />);
    const toggle = await screen.findByRole("button", { name: /Show English/ });
    await userEvent.click(toggle);
    expect(await screen.findByText("Anna lives in Moscow.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Hide English/ }));
    await waitFor(() => expect(screen.queryByText("Anna lives in Moscow.")).not.toBeInTheDocument());
  });

  it("switches stories when a different level is selected", async () => {
    render(<StoryPage language="russian" languageLabel="Russian" />);
    await screen.findByRole("heading", { name: "Утро Анны" });
    await userEvent.click(screen.getByRole("button", { name: "A2" }));
    expect(await screen.findByRole("heading", { name: "На рынке" })).toBeInTheDocument();
    expect(getStory).toHaveBeenCalledWith("ru-a2");
  });

  it("marks the story complete on finish and jumps to the next unread story", async () => {
    render(<StoryPage language="russian" languageLabel="Russian" />);
    await screen.findByRole("heading", { name: "Утро Анны" });

    await userEvent.click(screen.getByRole("button", { name: /Finish story/ }));
    await waitFor(() => expect(completeStory).toHaveBeenCalledWith("ru-a1"));

    // The completion modal offers the next unread story (the A2 one).
    await userEvent.click(await screen.findByRole("button", { name: /Read next/ }));
    expect(await screen.findByRole("heading", { name: "На рынке" })).toBeInTheDocument();
    expect(getStory).toHaveBeenCalledWith("ru-a2");
  });
});
