const { LEVEL_XP_MULTIPLIER } = require("./data/constants.ts");

// How a session's XP is worked out. Every session payload carries its rules as `xp`, so a
// client can show a live estimate without a copy of the formula that could drift.

type LessonXpRules = {
  kind: "lesson";
  base: number;
  perQuestion: number;
  levelMultiplier: number;
  // The first bonus whose accuracy is reached applies.
  bonuses: Array<{ minAccuracy: number; xp: number }>;
  lowAccuracy: { below: number; penalty: number };
  perMistake: number;
  perHint: number;
  perReveal: number;
  minimum: number;
};

// Practice drills: a fixed amount for listening and word drills, one per right answer for
// speaking. A mix of drill types earns nothing.
type PracticeXpRules = {
  kind: "practice";
  fixed: number;
  perCorrect: number;
};

type XpRules = LessonXpRules | PracticeXpRules;

type LessonXpInput = {
  score: number;
  maxScore: number;
  mistakes: number;
  hintsUsed: number;
  revealedAnswers: number;
};

const PRACTICE_XP_BY_TYPE: Record<string, number> = {
  practice_listen: 10,
  practice_words: 5
};

function lessonXpRules(level: string): LessonXpRules {
  return {
    kind: "lesson",
    base: 16,
    perQuestion: 2,
    levelMultiplier: LEVEL_XP_MULTIPLIER[level] || 1,
    bonuses: [
      { minAccuracy: 0.9, xp: 8 },
      { minAccuracy: 0.75, xp: 4 }
    ],
    lowAccuracy: { below: 0.5, penalty: 6 },
    perMistake: 2,
    perHint: 1,
    perReveal: 3,
    minimum: 4
  };
}

function practiceXpRules(questions: Array<{ type: string }>): PracticeXpRules {
  const types = new Set((questions || []).map((question) => question.type));
  if (types.size !== 1) return { kind: "practice", fixed: 0, perCorrect: 0 };
  const [type] = Array.from(types);
  if (type === "practice_speak") return { kind: "practice", fixed: 0, perCorrect: 1 };
  return { kind: "practice", fixed: PRACTICE_XP_BY_TYPE[type] || 0, perCorrect: 0 };
}

// Practice drills follow practice rules; everything else, mistake drills and checkpoints
// included, is scored like a lesson.
function sessionXpRules(level: string, questions: Array<{ type: string }>, scoredAsLesson = false): XpRules {
  const allPractice = Array.isArray(questions) && questions.length > 0 &&
    questions.every((question) => String(question.type || "").startsWith("practice_"));
  return allPractice && !scoredAsLesson ? practiceXpRules(questions) : lessonXpRules(level);
}

function lessonXp(rules: LessonXpRules, input: LessonXpInput): { accuracy: number; xpGained: number } {
  const { score, maxScore, mistakes, hintsUsed, revealedAnswers } = input;
  const accuracy = maxScore > 0 ? score / maxScore : 0;
  const bonus = rules.bonuses.find((entry) => accuracy >= entry.minAccuracy)?.xp ?? 0;
  const penalty = (accuracy < rules.lowAccuracy.below ? rules.lowAccuracy.penalty : 0) +
    mistakes * rules.perMistake + hintsUsed * rules.perHint + revealedAnswers * rules.perReveal;
  const base = rules.base + maxScore * rules.perQuestion;
  const xpGained = Math.max(rules.minimum, Math.round(base * rules.levelMultiplier + bonus - penalty));
  return { accuracy, xpGained };
}

function practiceXp(rules: PracticeXpRules, score: number, questionCount: number): number {
  return rules.fixed + rules.perCorrect * Math.max(0, Math.min(score, questionCount));
}

module.exports = {
  lessonXpRules,
  practiceXpRules,
  sessionXpRules,
  lessonXp,
  practiceXp
};
