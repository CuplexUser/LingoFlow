// The knowledge map from GET /api/knowledge: what the learner knows, skill by skill, for
// each unit of the path. Worked out on the server from spaced-repetition progress and
// recent answers; see server/src/knowledge.ts in the API repo.

export type SkillState = "not_started" | "learning" | "weak" | "shaky" | "known" | "strong";
export type SkillKind = "vocab" | "function" | "grammar";
export type Ability = "reading" | "listening" | "speaking" | "writing";

export type KnowledgeSkill = {
  id: string;
  label: string;
  kind: SkillKind;
  description: string;
  state: SkillState;
  itemsSeen: number;
  itemsTotal: number;
  // 0 to 1 over the skill's latest answers; null before any.
  accuracy: number | null;
  lastPracticedAt: string | null;
  dueCount: number;
};

export type UnitExamSummary = {
  correct: number;
  total: number;
  passed: boolean;
  takenAt: string;
};

export type KnowledgeUnit = {
  category: string;
  label: string;
  skillCount: number;
  // Null for a level behind Premium.
  abilities: Record<Ability, { accuracy: number | null; attempts: number }> | null;
  // Empty for a level behind Premium.
  skills: KnowledgeSkill[];
  lastExam: UnitExamSummary | null;
};

export type KnowledgeLevel = {
  id: string;
  label: string;
  name: string;
  premium: boolean;
  skillsKnown: number;
  skillsTotal: number;
  units: KnowledgeUnit[];
};

export type SkillRef = {
  id: string;
  label: string;
  level: string;
  category: string;
  state: SkillState;
  accuracy: number | null;
};

export type KnowledgeMap = {
  language: string;
  levels: KnowledgeLevel[];
  weakest: SkillRef[];
  strongest: SkillRef[];
  dueForReview: SkillRef[];
};
