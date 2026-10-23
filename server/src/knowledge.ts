// The knowledge map: what a learner knows, skill by skill (see data/skills.ts). Nothing is
// stored. It is worked out on each read from item_progress (where each item stands in spaced
// repetition) and attempt_history (recent answers), joined to skills through the in-memory
// item → skills map, so retagging content changes the map with no migration.

// Every threshold the map uses, in one place.
const THRESHOLDS = {
  // An item answered right this many times in a row is known, and strong at strongStreak.
  knownStreak: 2,
  strongStreak: 4,
  // A skill's accuracy covers its last recentAttempts answers and counts from minAttempts.
  recentAttempts: 12,
  minAttempts: 3,
  weakAccuracy: 0.6,
  shakyAccuracy: 0.75,
  // A skill is shaky too when more than this share of the items seen were last answered
  // wrong or are due for review.
  shakyShare: 1 / 3,
  // Known when this share of the skill's items is known or strong; strong also needs a
  // passed unit exam.
  knownShare: 0.7,
  strongShare: 0.7,
  // An ability's accuracy in a unit covers this many of the unit's latest answers.
  abilityAttempts: 20,
  // How many skills the weakest, strongest and due lists hold.
  listSize: 5
};

type ItemState = "not_seen" | "learning" | "known" | "strong" | "due";
type SkillState = "not_started" | "learning" | "weak" | "shaky" | "known" | "strong";
type Ability = "reading" | "listening" | "speaking" | "writing";

type ProgressRow = {
  itemId: string;
  streak: number;
  attempts: number;
  correct: number;
  errorCount: number;
  lastSeenDate: string | null;
  nextDueDate: string | null;
  flashcardKnown: boolean;
};

type AttemptRow = { itemId: string; questionType: string; correct: boolean; createdAt?: string };

type SkillSummary = {
  state: SkillState;
  itemsSeen: number;
  itemsTotal: number;
  accuracy: number | null;
  lastPracticedAt: string | null;
  dueCount: number;
};

type ExamRow = {
  level: string;
  category: string;
  correct: number;
  total: number;
  passed: boolean;
  perSkill: Record<string, { correct: number; total: number }>;
  takenAt: string;
};

type SkillRef = { id: string; label: string; level: string; category: string; state: SkillState; accuracy: number | null };

const ABILITIES: Ability[] = ["reading", "listening", "speaking", "writing"];

// The exercise types that show each ability. Flashcards are left out of every measure,
// because the learner grades them themselves.
const ABILITY_BY_TYPE: Record<string, Ability> = {
  mc_sentence: "reading",
  cloze_sentence: "reading",
  dialogue_turn: "reading",
  roleplay: "reading",
  matching: "reading",
  dictation_sentence: "listening",
  practice_listen: "listening",
  pronunciation: "speaking",
  practice_speak: "speaking",
  build_sentence: "writing"
};
const UNMEASURED_TYPES = new Set(["flashcard", "practice_words"]);

function itemState(row: ProgressRow | undefined, today: string): ItemState {
  if (!row || (!row.attempts && !row.flashcardKnown)) return "not_seen";
  if (row.streak < THRESHOLDS.knownStreak) return "learning";
  if (row.nextDueDate && row.nextDueDate < today) return "due";
  return row.streak >= THRESHOLDS.strongStreak ? "strong" : "known";
}

function skillState(input: {
  itemsTotal: number;
  seen: number;
  known: number;
  strong: number;
  due: number;
  missed: number;
  answered: number;
  accuracy: number | null;
  examPassed?: boolean;
}): SkillState {
  const { itemsTotal, seen, known, strong, due, missed, answered, accuracy, examPassed = false } = input;
  if (!seen) return "not_started";
  const measured = accuracy !== null && answered >= THRESHOLDS.minAttempts;
  if (measured && (accuracy as number) < THRESHOLDS.weakAccuracy) return "weak";
  if ((measured && (accuracy as number) < THRESHOLDS.shakyAccuracy) || (missed + due) / seen > THRESHOLDS.shakyShare) {
    return "shaky";
  }
  if (examPassed && strong / itemsTotal >= THRESHOLDS.strongShare) return "strong";
  if ((known + strong) / itemsTotal >= THRESHOLDS.knownShare) return "known";
  return "learning";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// One skill's standing, from its items' progress and its latest answers (newest first).
function summarizeSkill(
  itemIds: string[],
  progress: Map<string, ProgressRow>,
  recent: AttemptRow[],
  today: string,
  examPassed = false
): SkillSummary {
  const counts = { seen: 0, known: 0, strong: 0, due: 0, missed: 0 };
  let lastPracticedAt: string | null = null;
  let totalAttempts = 0;
  let totalCorrect = 0;
  for (const id of itemIds) {
    const row = progress.get(id);
    const state = itemState(row, today);
    if (!row || state === "not_seen") continue;
    counts.seen += 1;
    if (state === "known") counts.known += 1;
    if (state === "strong") counts.strong += 1;
    if (state === "due") counts.due += 1;
    if (row.streak === 0 && row.errorCount > 0) counts.missed += 1;
    if (row.lastSeenDate && (!lastPracticedAt || row.lastSeenDate > lastPracticedAt)) lastPracticedAt = row.lastSeenDate;
    totalAttempts += row.attempts;
    totalCorrect += row.correct;
  }
  // Answers from before attempt_history existed live only in item_progress's totals.
  const answered = recent.length || totalAttempts;
  const accuracy = recent.length
    ? recent.filter((attempt) => attempt.correct).length / recent.length
    : totalAttempts ? totalCorrect / totalAttempts : null;
  return {
    state: skillState({ itemsTotal: itemIds.length, ...counts, answered, accuracy, examPassed }),
    itemsSeen: counts.seen,
    itemsTotal: itemIds.length,
    accuracy: accuracy === null ? null : round(accuracy),
    lastPracticedAt,
    dueCount: counts.due
  };
}

function lastExamOf(exam: ExamRow | undefined) {
  return exam ? { correct: exam.correct, total: exam.total, passed: exam.passed, takenAt: exam.takenAt } : null;
}

function emptyAbilities() {
  return Object.fromEntries(ABILITIES.map((ability) => [ability, { accuracy: null as number | null, attempts: 0 }])) as
    Record<Ability, { accuracy: number | null; attempts: number }>;
}

// The map for one language. Units and their order come from the learning path
// (unitsByLevel), so the map lists what the path teaches. Levels above levelCap are listed
// as premium, without skill details.
function buildKnowledgeMap(input: {
  language: string;
  levelOrder: string[];
  levelNames: Record<string, string>;
  levelCap: string;
  unitsByLevel: Record<string, Array<{ category: string; label: string }>>;
  items: any[];
  skills: any;
  progressRows: ProgressRow[];
  attempts: AttemptRow[];
  today: string;
  // Newest first.
  exams?: ExamRow[];
}) {
  const { language, levelOrder, levelNames, levelCap, unitsByLevel, items, skills, progressRows, attempts, today } = input;
  const exams = input.exams || [];
  // A skill an exam was passed with, each of its questions answered right.
  const passedExamSkills = new Set<string>();
  const lastExams = new Map<string, ExamRow>();
  for (const exam of exams) {
    const key = `${exam.level}:${exam.category}`;
    if (!lastExams.has(key)) lastExams.set(key, exam);
    if (!exam.passed) continue;
    for (const [skillId, score] of Object.entries(exam.perSkill)) {
      if (score.total > 0 && score.correct === score.total) passedExamSkills.add(skillId);
    }
  }
  const rank = (level: string) => levelOrder.indexOf(level);
  const isPremium = (level: string) => Boolean(levelCap) && rank(level) > rank(levelCap);

  // An item can have a row per category it was answered in; the busiest one stands for it.
  const progress = new Map<string, ProgressRow>();
  for (const row of progressRows) {
    const existing = progress.get(row.itemId);
    if (!existing || row.attempts > existing.attempts) progress.set(row.itemId, row);
  }

  const unitOfItem = new Map<string, string>();
  for (const item of items) {
    const level = String(item.difficulty || item.level || "a1").toLowerCase();
    unitOfItem.set(String(item.id), `${level}:${item.category}`);
  }

  const recentBySkill = new Map<string, AttemptRow[]>();
  const abilityAnswers = new Map<string, Record<Ability, boolean[]>>();
  for (const attempt of attempts) {
    if (UNMEASURED_TYPES.has(attempt.questionType)) continue;
    for (const skillId of skills.getItemSkills(language, attempt.itemId) as string[]) {
      const list = recentBySkill.get(skillId) || [];
      if (list.length < THRESHOLDS.recentAttempts) list.push(attempt);
      recentBySkill.set(skillId, list);
    }
    const ability = ABILITY_BY_TYPE[attempt.questionType];
    const unit = unitOfItem.get(attempt.itemId);
    if (!ability || !unit) continue;
    const answers = abilityAnswers.get(unit) || { reading: [], listening: [], speaking: [], writing: [] };
    if (answers[ability].length < THRESHOLDS.abilityAttempts) answers[ability].push(attempt.correct);
    abilityAnswers.set(unit, answers);
  }

  const summaries = new Map<string, SkillSummary>();
  const summaryOf = (skillId: string) => {
    if (!summaries.has(skillId)) {
      summaries.set(skillId, summarizeSkill(
        skills.getSkillItems(language, skillId),
        progress,
        recentBySkill.get(skillId) || [],
        today,
        passedExamSkills.has(skillId)
      ));
    }
    return summaries.get(skillId) as SkillSummary;
  };

  const refs = new Map<string, SkillRef & { dueCount: number }>();
  const levels = levelOrder.map((level) => {
    const premium = isPremium(level);
    const levelSkills = new Set<string>();
    const knownSkills = new Set<string>();
    const units = (unitsByLevel[level] || []).map((unit) => {
      const unitSkills = skills.getUnitSkills(language, unit.category, level) as any[];
      unitSkills.forEach((skill) => levelSkills.add(skill.id));
      if (premium) {
        return { category: unit.category, label: unit.label, skillCount: unitSkills.length, abilities: null, skills: [], lastExam: null };
      }
      const abilities = emptyAbilities();
      const answers = abilityAnswers.get(`${level}:${unit.category}`);
      for (const ability of ABILITIES) {
        const list = answers?.[ability] || [];
        abilities[ability] = {
          accuracy: list.length ? round(list.filter(Boolean).length / list.length) : null,
          attempts: list.length
        };
      }
      return {
        category: unit.category,
        label: unit.label,
        skillCount: unitSkills.length,
        abilities,
        skills: unitSkills.map((skill) => {
          const summary = summaryOf(skill.id);
          if (summary.state === "known" || summary.state === "strong") knownSkills.add(skill.id);
          if (!refs.has(skill.id)) {
            refs.set(skill.id, {
              id: skill.id,
              label: skill.label,
              level,
              category: unit.category,
              state: summary.state,
              accuracy: summary.accuracy,
              dueCount: summary.dueCount
            });
          }
          return {
            id: skill.id,
            label: skill.label,
            kind: skill.kind,
            description: skill.description || "",
            ...summary
          };
        }),
        lastExam: lastExamOf(lastExams.get(`${level}:${unit.category}`))
      };
    });
    return {
      id: level,
      label: level.toUpperCase(),
      name: levelNames[level] || level.toUpperCase(),
      premium,
      skillsKnown: knownSkills.size,
      skillsTotal: levelSkills.size,
      units
    };
  });

  const all = [...refs.values()];
  const toRef = ({ dueCount: _dueCount, ...ref }: SkillRef & { dueCount: number }): SkillRef => ref;
  const accuracyOf = (ref: SkillRef) => ref.accuracy ?? 0;
  const weakest = all
    .filter((ref) => ref.state === "weak" || ref.state === "shaky")
    .sort((a, b) => Number(a.state === "shaky") - Number(b.state === "shaky") || accuracyOf(a) - accuracyOf(b))
    .slice(0, THRESHOLDS.listSize)
    .map(toRef);
  const strongest = all
    .filter((ref) => ref.state === "strong" || ref.state === "known")
    .sort((a, b) => Number(a.state === "known") - Number(b.state === "known") || accuracyOf(b) - accuracyOf(a))
    .slice(0, THRESHOLDS.listSize)
    .map(toRef);
  const dueForReview = all
    .filter((ref) => ref.dueCount > 0)
    .sort((a, b) => b.dueCount - a.dueCount)
    .slice(0, THRESHOLDS.listSize)
    .map(toRef);

  return { language, levels, weakest, strongest, dueForReview };
}

function createKnowledge(deps: any) {
  const { database, SKILLS, getAllItems, LEVEL_ORDER, levelNames, getUnitsByLevel } = deps;

  async function buildKnowledge(userId: number, language: string, levelCap: string) {
    const progressRows = await database.getItemProgressForLanguage(userId, language);
    const attempts = await database.getRecentAttempts(userId, language);
    const exams = await database.getUnitExams(userId, language);
    return buildKnowledgeMap({
      language,
      levelOrder: LEVEL_ORDER,
      levelNames,
      levelCap,
      unitsByLevel: getUnitsByLevel(language),
      items: getAllItems(language),
      skills: SKILLS,
      progressRows,
      attempts,
      today: database.toIsoDate(),
      exams
    });
  }

  return { buildKnowledge };
}

// One unit's skills in a map built by buildKnowledgeMap, or [] for a premium or unknown unit.
function unitSkillsOf(map: ReturnType<typeof buildKnowledgeMap>, level: string, category: string) {
  return map.levels.find((entry) => entry.id === level)?.units.find((unit) => unit.category === category)?.skills || [];
}

module.exports = {
  THRESHOLDS,
  unitSkillsOf,
  itemState,
  skillState,
  summarizeSkill,
  buildKnowledgeMap,
  createKnowledge
};
