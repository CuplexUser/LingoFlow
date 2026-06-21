export type StoryLevel = "a1" | "a2" | "b1" | "b2";

export type StorySentence = {
  target: string;
  en: string;
  // When true, render a paragraph break before this sentence (longer stories).
  break?: boolean;
};

export type StoryGlossEntry = {
  g: string;
  pos: string;
  note?: string;
};

export type StoryTextLang = "en" | "target";

// Comprehension question as sent to the client — the answer key (`correct` index
// and `explanation`) is stripped server-side and only returned after submission.
export type StoryQuestion = {
  stem: string;
  stemLang: StoryTextLang;
  options: string[];
  optionsLang: StoryTextLang;
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
  hasQuiz?: boolean;
  questionCount?: number;
  completed?: boolean;
  lastSentenceIndex?: number;
  quizScore?: number | null;
  quizTotal?: number | null;
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
  questions?: StoryQuestion[];
};

// Result of POST /api/stories/:id/complete — quiz scoring + the XP awarded for finishing.
export type StoryCompletionResult = {
  ok: boolean;
  quizScore: number | null;
  quizTotal: number | null;
  perQuestion: boolean[];
  correctAnswers: number[];
  explanations: (string | null)[];
  xpGained: number;
  alreadyAwarded: boolean;
  todayXp: number;
};

// Aggregated reading activity from GET /api/stories/stats.
export type ReadingStats = {
  storiesRead: number;
  sentencesRead: number;
  wordsSaved: number;
  quizzesTaken: number;
  levels: string[];
  themes: string[];
};

export type SavedWord = {
  word: string;
  translation: string;
  language: string;
  storyId: string;
  category: string;
  createdAt: string;
};
