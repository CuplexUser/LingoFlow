export type StoryLevel = "a1" | "a2" | "b1" | "b2";

export type StorySentence = {
  target: string;
  en: string;
};

export type StoryGlossEntry = {
  g: string;
  pos: string;
  note?: string;
};

// Lightweight shape returned by GET /api/stories (no sentences/glossary payload).
export type StorySummary = {
  id: string;
  language: string;
  level: StoryLevel;
  title: string;
  titleEn: string;
  theme: string;
  category: string;
  sentenceCount: number;
};

// Full shape returned by GET /api/stories/:id.
export type Story = {
  id: string;
  language: string;
  level: StoryLevel;
  title: string;
  titleEn: string;
  theme: string;
  category: string;
  sentences: StorySentence[];
  glossary: Record<string, StoryGlossEntry>;
  culturalNote: { term: string; body: string };
};

export type SavedWord = {
  word: string;
  translation: string;
  language: string;
  storyId: string;
  category: string;
  createdAt: string;
};
