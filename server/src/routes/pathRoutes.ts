// The learning path: the course as CEFR levels (A1–B2) of units, one unit per category
// with enough content at that level, each unit two to four lessons depending on how much
// content it has. A placement check sets the level a language's path starts at, and
// checkpoints let a learner test out of the units ahead of them. Lessons and checkpoints are ordinary sessions; path_sessions tags them so
// /api/session/complete can advance the path.

const { sessionXpRules } = require("../xpRules.ts");

const UNITS_PER_SECTION = 4;
// A category needs this many items at a level to make a unit there.
const MIN_UNIT_ITEMS = 8;
const LESSON_QUESTIONS = 10;
const MIN_LESSON_QUESTIONS = 6;
// A review lesson may be this short rather than bring back words marked "I knew this".
const MIN_REVIEW_QUESTIONS = 4;
const CHECKPOINT_QUESTIONS = 15;
// Testing out of a single unit ("Too easy? Jump ahead" after a lesson) is shorter.
const UNIT_CHECK_QUESTIONS = 10;
const CHECKPOINT_PASS_RATIO = 0.8;
const PLACEMENT_QUESTIONS_PER_LEVEL = 6;
const PLACEMENT_MAX_QUESTIONS = 12;
const PLACEMENT_PASS_RATIO = 0.6;
const CHECKPOINT_CATEGORY = "__checkpoint__";
const PLACEMENT_CATEGORY = "__placement__";
// Checks test what a learner knows, so they skip exercises that need a microphone or
// that only drill (flashcards, matching).
const CHECKPOINT_QUESTION_TYPES = new Set(["mc_sentence", "cloze_sentence", "dialogue_turn", "build_sentence"]);
const PLACEMENT_QUESTION_TYPES = new Set(["mc_sentence", "cloze_sentence", "dialogue_turn"]);
const LEVEL_NAMES: Record<string, string> = {
  a1: "Beginner",
  a2: "Elementary",
  b1: "Intermediate",
  b2: "Upper intermediate"
};

type PathUnit = {
  category: string;
  label: string;
  description: string;
  number: number;
  lessonsDone: number;
  lessonCount: number;
  testedOut: boolean;
  done: boolean;
  state: "done" | "skipped" | "current" | "locked" | "premium";
};

type PathLevel = {
  id: string;
  label: string;
  name: string;
  state: "placed_out" | "done" | "current" | "locked" | "premium";
  unitsDone: number;
  unitCount: number;
  units: PathUnit[];
};

type PathCheck = {
  scope: "unit" | "section" | "level";
  level: string;
  categories: string[];
  labels: string[];
  fromUnit: number;
  toUnit: number;
  questionCount: number;
  passCount: number;
};

// A unit's lessons each bring up to ten new items, and the last one reviews them. A unit
// with ten items therefore has two lessons rather than four that repeat the same words.
function lessonsForUnit(itemCount: number): number {
  if (itemCount <= 12) return 2;
  if (itemCount <= 20) return 3;
  return 4;
}

function createLearningPath(deps: any) {
  const { database, CATEGORIES, LEVEL_ORDER, getAllItems, generateSession, evaluateAttempt, crypto } = deps;

  function rank(level: unknown): number {
    return LEVEL_ORDER.indexOf(String(level || "").toLowerCase());
  }

  function normalizeLevel(level: unknown): string {
    return rank(level) >= 0 ? String(level).toLowerCase() : "a1";
  }

  function isAboveCap(level: string, levelCap: string): boolean {
    return Boolean(levelCap) && rank(level) > rank(levelCap);
  }

  function itemLevel(item: any): string {
    return String(item?.difficulty || item?.level || "a1").trim().toLowerCase();
  }

  function shuffled<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Units per level, in course order. Content is static apart from approved community
  // exercises, and counting a language's ~1,200 items is cheap, so this is not cached.
  function getUnitsByLevel(language: string): Record<string, Array<{ category: string; label: string; description: string; lessonCount: number }>> {
    const counts = new Map<string, number>();
    for (const item of getAllItems(language) as any[]) {
      const key = `${itemLevel(item)}:${item.category}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const byLevel: Record<string, Array<{ category: string; label: string; description: string; lessonCount: number }>> = {};
    for (const level of LEVEL_ORDER) {
      byLevel[level] = CATEGORIES
        .filter((category: any) => (counts.get(`${level}:${category.id}`) || 0) >= MIN_UNIT_ITEMS)
        .map((category: any) => ({
          category: category.id,
          label: category.label,
          description: category.description,
          lessonCount: lessonsForUnit(counts.get(`${level}:${category.id}`) || 0)
        }));
    }
    return byLevel;
  }

  function describeCheck(scope: PathCheck["scope"], level: string, units: PathUnit[]): PathCheck | null {
    if (!units.length) return null;
    const questionCount = scope === "unit" ? UNIT_CHECK_QUESTIONS : CHECKPOINT_QUESTIONS;
    return {
      scope,
      level,
      categories: units.map((unit) => unit.category),
      labels: units.map((unit) => unit.label),
      fromUnit: units[0].number,
      toUnit: units[units.length - 1].number,
      questionCount,
      passCount: Math.ceil(questionCount * CHECKPOINT_PASS_RATIO)
    };
  }

  async function buildPath(userId: number, language: string, levelCap: string) {
    const state = await database.getPathState(userId, language);
    const settings = await database.getSettings(userId);
    const rows = await database.getPathUnits(userId, language);
    const categoryProgress = await database.getCategoryProgress(userId, language) as any[];

    const startLevel = normalizeLevel(state?.startLevel || settings.selfRatedLevel);
    // A free learner placed above the cap starts at the cap; Premium opens their real level.
    const effectiveStart = isAboveCap(startLevel, levelCap) ? levelCap : startLevel;
    const needsPlacement = !state && !categoryProgress.some((entry: any) => Number(entry.attempts) > 0);
    const progress = new Map<string, any>(rows.map((row: any) => [`${row.level}:${row.category}`, row]));
    const unitsByLevel = getUnitsByLevel(language);

    let current: { level: string; category: string; label: string; unitNumber: number; lessonIndex: number } | null = null;
    let jumpAhead: PathCheck | null = null;
    let unitCheck: PathCheck | null = null;
    let levelTest: PathCheck | null = null;

    const levels: PathLevel[] = LEVEL_ORDER.map((level: string) => {
      const premium = isAboveCap(level, levelCap);
      const placedOut = !premium && rank(level) < rank(effectiveStart);
      const units: PathUnit[] = unitsByLevel[level].map((unit, index) => {
        const row = progress.get(`${level}:${unit.category}`);
        // Progress from when the unit had more lessons counts up to its current length.
        const lessonsDone = Math.min(unit.lessonCount, Number(row?.lessonsDone) || 0);
        const testedOut = Boolean(row?.testedOut);
        return {
          ...unit,
          number: index + 1,
          lessonsDone,
          testedOut,
          done: testedOut || lessonsDone >= unit.lessonCount,
          state: "locked"
        };
      });
      const unitsDone = units.filter((unit) => unit.done).length;

      let levelState: PathLevel["state"];
      if (premium) levelState = "premium";
      else if (placedOut) levelState = "placed_out";
      else if (units.length && unitsDone === units.length) levelState = "done";
      else if (!current && units.length) levelState = "current";
      else levelState = "locked";

      let currentIndex = -1;
      units.forEach((unit, index) => {
        if (unit.done) unit.state = "done";
        else if (levelState === "placed_out") unit.state = "skipped";
        else if (levelState === "premium") unit.state = "premium";
        else if (levelState === "current" && currentIndex < 0) {
          unit.state = "current";
          currentIndex = index;
        } else unit.state = "locked";
      });

      if (levelState === "current" && currentIndex >= 0) {
        const unit = units[currentIndex];
        current = {
          level,
          category: unit.category,
          label: unit.label,
          unitNumber: unit.number,
          lessonIndex: unit.lessonsDone
        };
        const sectionEnd = (Math.floor(currentIndex / UNITS_PER_SECTION) + 1) * UNITS_PER_SECTION;
        jumpAhead = describeCheck("section", level, units.slice(currentIndex, sectionEnd).filter((entry) => !entry.done));
        unitCheck = describeCheck("unit", level, [unit]);
        levelTest = describeCheck("level", level, units.filter((entry) => !entry.done));
      }

      return {
        id: level,
        label: level.toUpperCase(),
        name: LEVEL_NAMES[level] || level.toUpperCase(),
        state: levelState,
        unitsDone,
        unitCount: units.length,
        units
      };
    });

    return {
      language,
      startLevel,
      placementDone: Boolean(state?.placementDone),
      needsPlacement,
      levelCap: levelCap || null,
      currentLevel: current ? (current as { level: string }).level : null,
      current,
      jumpAhead,
      unitCheck,
      levelTest,
      levels
    };
  }

  function unitLessonCount(language: string, level: string, category: string): number {
    return getUnitsByLevel(language)[level]?.find((unit) => unit.category === category)?.lessonCount ?? 4;
  }

  // Counts a question as known only when every attempt at it was right, so retrying after
  // a mistake does not pass a checkpoint.
  function countFirstTryCorrect(questions: any[], evaluatedAttempts: Array<{ question: any; correct: boolean }>): number {
    const right = new Set<string>();
    const wrong = new Set<string>();
    for (const entry of evaluatedAttempts) {
      (entry.correct ? right : wrong).add(String(entry.question.id));
    }
    return questions.filter((question) => right.has(String(question.id)) && !wrong.has(String(question.id))).length;
  }

  async function applySessionCompletion({ userId, sessionId, language, questions, evaluatedAttempts }: {
    userId: number;
    sessionId: string;
    language: string;
    questions: any[];
    evaluatedAttempts: Array<{ question: any; correct: boolean }>;
  }) {
    const record = await database.getPathSession(sessionId, userId);
    if (!record) return null;
    const total = questions.length;
    const correct = countFirstTryCorrect(questions, evaluatedAttempts);

    if (record.kind === "lesson") {
      const category = String(record.details.category || "");
      const lessonCount = unitLessonCount(language, record.level, category);
      await database.recordPathLesson(userId, language, record.level, category, lessonCount);
      const unit = (await database.getPathUnits(userId, language) as any[])
        .find((row) => row.level === record.level && row.category === category);
      const lessonsDone = Math.min(lessonCount, Number(unit?.lessonsDone) || 0);
      return {
        kind: "lesson",
        level: record.level,
        category,
        lessonsDone,
        lessonCount,
        unitDone: lessonsDone >= lessonCount,
        correct,
        total
      };
    }

    if (record.kind === "checkpoint") {
      const categories: string[] = Array.isArray(record.details.categories) ? record.details.categories : [];
      const passCount = Math.ceil(total * CHECKPOINT_PASS_RATIO);
      const passed = total > 0 && correct >= passCount;
      if (passed) {
        for (const category of categories) {
          await database.markPathUnitsTestedOut(userId, language, record.level, [category], unitLessonCount(language, record.level, category));
        }
      }
      return {
        kind: "checkpoint",
        level: record.level,
        scope: record.details.scope || "section",
        categories,
        passed,
        correct,
        total,
        passCount
      };
    }

    return null;
  }

  function sessionPayload(sessionId: string, language: string, category: string, generated: any, questions: any[]) {
    return {
      sessionId,
      category,
      language,
      recommendedLevel: generated.recommendedLevel,
      difficultyMultiplier: generated.difficultyMultiplier,
      xp: sessionXpRules(generated.recommendedLevel, questions, category === CHECKPOINT_CATEGORY),
      questions,
      practiceMode: ""
    };
  }

  function sessionExpiry(): string {
    return database.toIsoDate(new Date(Date.now() + (1000 * 60 * 60 * 24 * 2)));
  }

  async function startLesson(userId: number, language: string, level: string, category: string, levelCap: string) {
    const path = await buildPath(userId, language, levelCap);
    const levelEntry = path.levels.find((entry) => entry.id === level);
    const unit = levelEntry?.units.find((entry) => entry.category === category);
    if (!levelEntry || !unit) return { status: 404, body: { error: "This unit does not exist" } };
    if (levelEntry.state === "premium") {
      return { status: 402, body: { error: "This content requires LingoFlow Premium", code: "premium_required" } };
    }
    if (unit.state === "locked") {
      return {
        status: 409,
        body: { error: "Finish the units before this one, or jump ahead.", code: "unit_locked" }
      };
    }

    await database.pruneExpiredActiveSessions(userId, database.toIsoDate());
    const hints = await database.getItemSelectionHints(userId, language, category, database.toIsoDate());
    const generate = (notDueItemIds: string[]) => generateSession({
      language,
      category,
      mastery: 0,
      recentAccuracy: null,
      selfRatedLevel: level,
      exactLevel: level,
      maxLevel: levelCap,
      dueItemIds: hints.dueItemIds,
      weakItemIds: hints.weakItemIds,
      notDueItemIds,
      count: LESSON_QUESTIONS
    });
    let generated = generate(hints.notDueItemIds);
    // A unit has about twenty items at its level, so its later lessons run out of items
    // that are not yet due for review. Those lessons review what the unit already taught,
    // but not the words marked "I knew this", unless that leaves too little to make a lesson.
    if (generated.questions.length < MIN_LESSON_QUESTIONS) generated = generate(hints.knownItemIds || []);
    if (generated.questions.length < MIN_REVIEW_QUESTIONS) generated = generate([]);
    if (!generated.questions.length) {
      return { status: 404, body: { error: "No exercises found for this unit" } };
    }

    const sessionId = crypto.randomUUID();
    await database.createActiveSession({
      userId,
      sessionId,
      language,
      category,
      difficultyLevel: level,
      questions: generated.questions,
      expiresAt: sessionExpiry()
    });
    await database.createPathSession({
      sessionId,
      userId,
      kind: "lesson",
      level,
      details: { category }
    });

    return {
      status: 200,
      body: {
        ...sessionPayload(sessionId, language, category, generated, generated.questions),
        pathLesson: {
          kind: "lesson",
          level,
          category,
          unitLabel: unit.label,
          unitNumber: unit.number,
          lessonNumber: Math.min(unit.lessonsDone + 1, unit.lessonCount),
          lessonCount: unit.lessonCount
        }
      }
    };
  }

  // Up to `perCategory` questions of the allowed types from each category at `level`,
  // tagged with where they came from.
  function sampleCheckQuestions(
    language: string,
    level: string,
    categories: string[],
    allowedTypes: Set<string>,
    perCategory: number
  ): any[][] {
    return categories.map((category) => {
      const generated = generateSession({
        language,
        category,
        mastery: 0,
        recentAccuracy: null,
        selfRatedLevel: level,
        exactLevel: level,
        count: 15
      });
      return generated.questions
        .filter((question: any) => allowedTypes.has(question.type))
        .slice(0, perCategory)
        .map((question: any) => ({ ...question, sourceCategory: category }));
    });
  }

  // Takes questions from each pool in turn so every category gets a share.
  function interleave(pools: any[][], limit: number): any[] {
    const result: any[] = [];
    const seen = new Set<string>();
    for (let round = 0; result.length < limit; round += 1) {
      let added = false;
      for (const pool of pools) {
        const question = pool[round];
        if (!question || seen.has(question.id) || result.length >= limit) continue;
        seen.add(question.id);
        result.push(question);
        added = true;
      }
      if (!added && pools.every((pool) => round >= pool.length)) break;
    }
    return result;
  }

  async function startCheckpoint(userId: number, language: string, scope: string, levelCap: string) {
    const path = await buildPath(userId, language, levelCap);
    const check = scope === "level" ? path.levelTest : scope === "unit" ? path.unitCheck : path.jumpAhead;
    if (!check) {
      return { status: 409, body: { error: "There is nothing ahead to test out of right now." } };
    }

    await database.pruneExpiredActiveSessions(userId, database.toIsoDate());
    const pools = sampleCheckQuestions(
      language,
      check.level,
      check.categories,
      CHECKPOINT_QUESTION_TYPES,
      check.questionCount
    ).map((pool) => shuffled(pool));
    const questions = shuffled(interleave(pools, check.questionCount));
    if (!questions.length) {
      return { status: 404, body: { error: "No exercises found for this checkpoint" } };
    }

    const sessionId = crypto.randomUUID();
    await database.createActiveSession({
      userId,
      sessionId,
      language,
      category: CHECKPOINT_CATEGORY,
      difficultyLevel: check.level,
      questions,
      expiresAt: sessionExpiry()
    });
    await database.createPathSession({
      sessionId,
      userId,
      kind: "checkpoint",
      level: check.level,
      details: { scope: check.scope, categories: check.categories }
    });

    return {
      status: 200,
      body: {
        ...sessionPayload(sessionId, language, CHECKPOINT_CATEGORY, { recommendedLevel: check.level, difficultyMultiplier: 1 }, questions),
        pathCheckpoint: {
          ...check,
          kind: "checkpoint",
          questionCount: questions.length,
          passCount: Math.ceil(questions.length * CHECKPOINT_PASS_RATIO)
        }
      }
    };
  }

  async function startPlacement(userId: number, language: string) {
    const unitsByLevel = getUnitsByLevel(language);
    const questions: any[] = [];
    const levels: Record<string, string> = {};
    const categories: Record<string, string> = {};
    for (const level of LEVEL_ORDER) {
      // Two questions per category at most, so one topic cannot decide a level.
      const unitCategories = shuffled(unitsByLevel[level]).map((unit) => unit.category);
      const pools = sampleCheckQuestions(language, level, unitCategories, PLACEMENT_QUESTION_TYPES, 2);
      const picked = interleave(pools, PLACEMENT_QUESTIONS_PER_LEVEL)
        .filter((question) => !levels[question.id]);
      for (const question of picked) {
        levels[question.id] = level;
        categories[question.id] = question.sourceCategory;
        questions.push({ ...question, level });
      }
    }
    if (!questions.length) {
      return { status: 404, body: { error: "No placement questions for this language" } };
    }

    await database.pruneExpiredActiveSessions(userId, database.toIsoDate());
    const sessionId = crypto.randomUUID();
    await database.createActiveSession({
      userId,
      sessionId,
      language,
      category: PLACEMENT_CATEGORY,
      difficultyLevel: "a1",
      questions,
      expiresAt: sessionExpiry()
    });
    await database.createPathSession({
      sessionId,
      userId,
      kind: "placement",
      level: "a1",
      details: { levels, categories }
    });

    return {
      status: 200,
      body: {
        sessionId,
        language,
        questions,
        maxQuestions: PLACEMENT_MAX_QUESTIONS,
        passRatio: PLACEMENT_PASS_RATIO
      }
    };
  }

  // The highest level passed with no failed level below it. Untested levels neither
  // pass nor block, since the check starts near the learner's own estimate.
  function placeFromStats(stats: Record<string, { answered: number; correct: number }>): string | null {
    let placed: string | null = null;
    for (const level of LEVEL_ORDER) {
      const entry = stats[level];
      if (!entry || !entry.answered) continue;
      if (entry.correct / entry.answered >= PLACEMENT_PASS_RATIO) placed = level;
      else break;
    }
    return placed;
  }

  async function completePlacement(userId: number, language: string, sessionId: string, answers: any[], levelCap: string) {
    const session = await database.getActiveSession(sessionId, userId);
    const record = await database.getPathSession(sessionId, userId);
    if (!session || !record || record.kind !== "placement") {
      return { status: 404, body: { error: "Placement check not found" } };
    }
    if (session.completed) return { status: 409, body: { error: "Placement check already completed" } };
    if (session.language !== language) return { status: 400, body: { error: "Session metadata mismatch" } };

    const questionMap = new Map<string, any>(session.questions.map((question: any) => [String(question.id), question]));
    const byLevel: Record<string, { answered: number; correct: number }> = {};
    const bySkill: Record<string, Record<string, { answered: number; correct: number }>> = { vocabulary: {}, grammar: {} };
    const wrong: Array<{ question: any; level: string; category: string }> = [];
    const seen = new Set<string>();

    for (const answer of (Array.isArray(answers) ? answers : []).slice(0, PLACEMENT_MAX_QUESTIONS * 2)) {
      const questionId = String(answer?.questionId || "");
      const question = questionMap.get(questionId);
      if (!question || seen.has(questionId)) continue;
      seen.add(questionId);
      const level = String(record.details.levels?.[questionId] || "a1");
      const category = String(record.details.categories?.[questionId] || "");
      const correct = !answer?.skipped &&
        evaluateAttempt(question, { selectedOption: String(answer?.selectedOption || "") }).correct;
      const skill = category === "grammar" || question.type === "cloze_sentence" ? "grammar" : "vocabulary";
      for (const bucket of [byLevel, bySkill[skill]]) {
        bucket[level] = bucket[level] || { answered: 0, correct: 0 };
        bucket[level].answered += 1;
        if (correct) bucket[level].correct += 1;
      }
      if (!correct) wrong.push({ question, level, category });
    }

    const placed = placeFromStats(byLevel) || "a1";
    // Misses at or below the placed level are gaps worth reviewing; misses above it are
    // just content the learner has not reached yet.
    const today = database.toIsoDate();
    const reviewItems = wrong.filter((entry) => rank(entry.level) <= rank(placed));
    for (const entry of reviewItems) {
      await database.upsertItemProgressAttempt({
        userId,
        language,
        category: entry.category,
        itemId: entry.question.id,
        objective: entry.question.objective || "",
        correct: false,
        errorType: "wrong_option",
        today
      });
    }
    await database.markActiveSessionCompleted(sessionId, userId);
    await database.savePathState(userId, language, placed);
    await database.setSelfRatedLevel(userId, placed);

    return {
      status: 200,
      body: {
        level: placed,
        levelName: LEVEL_NAMES[placed],
        premiumRequired: isAboveCap(placed, levelCap),
        levels: LEVEL_ORDER.map((level: string) => ({ level, ...(byLevel[level] || { answered: 0, correct: 0 }) })),
        skills: [
          { id: "vocabulary", label: "Vocabulary", level: placeFromStats(bySkill.vocabulary) },
          { id: "grammar", label: "Grammar", level: placeFromStats(bySkill.grammar) }
        ],
        reviewCount: reviewItems.length
      }
    };
  }

  return {
    lessonsForUnit,
    LEVEL_NAMES,
    CHECKPOINT_CATEGORY,
    PLACEMENT_CATEGORY,
    normalizeLevel,
    getUnitsByLevel,
    buildPath,
    applySessionCompletion,
    startLesson,
    startCheckpoint,
    startPlacement,
    completePlacement
  };
}

function registerPathRoutes(app: any, deps: any, learningPath: ReturnType<typeof createLearningPath>): void {
  const { requireAuth, database, LANGUAGES, getLevelCap } = deps;

  function readLanguage(value: unknown): string {
    const language = String(value || "").trim().toLowerCase();
    return LANGUAGES.some((entry: any) => entry.id === language) ? language : "";
  }

  app.get("/api/path", requireAuth, async (req: any, res: any) => {
    const language = readLanguage(req.query.language);
    if (!language) return res.status(400).json({ error: "A supported language is required" });
    return res.json(await learningPath.buildPath(req.authUserId, language, await getLevelCap(req)));
  });

  // Sets where the path starts without a placement check ("I'm new", or a level picked by hand).
  app.post("/api/path/start", requireAuth, async (req: any, res: any) => {
    const language = readLanguage(req.body?.language);
    if (!language) return res.status(400).json({ error: "A supported language is required" });
    const level = learningPath.normalizeLevel(req.body?.level);
    await database.savePathState(req.authUserId, language, level);
    await database.setSelfRatedLevel(req.authUserId, level);
    return res.json(await learningPath.buildPath(req.authUserId, language, await getLevelCap(req)));
  });

  app.post("/api/path/lesson", requireAuth, async (req: any, res: any) => {
    const language = readLanguage(req.body?.language);
    const level = String(req.body?.level || "").toLowerCase();
    const category = String(req.body?.category || "");
    if (!language || !level || !category) {
      return res.status(400).json({ error: "language, level and category are required" });
    }
    const result = await learningPath.startLesson(req.authUserId, language, level, category, await getLevelCap(req));
    return res.status(result.status).json(result.body);
  });

  app.post("/api/path/checkpoint", requireAuth, async (req: any, res: any) => {
    const language = readLanguage(req.body?.language);
    if (!language) return res.status(400).json({ error: "A supported language is required" });
    const scope = req.body?.scope === "level" || req.body?.scope === "unit" ? req.body.scope : "section";
    const result = await learningPath.startCheckpoint(req.authUserId, language, scope, await getLevelCap(req));
    return res.status(result.status).json(result.body);
  });

  app.post("/api/placement/start", requireAuth, async (req: any, res: any) => {
    const language = readLanguage(req.body?.language);
    if (!language) return res.status(400).json({ error: "A supported language is required" });
    const result = await learningPath.startPlacement(req.authUserId, language);
    return res.status(result.status).json(result.body);
  });

  app.post("/api/placement/complete", requireAuth, async (req: any, res: any) => {
    const language = readLanguage(req.body?.language);
    const sessionId = String(req.body?.sessionId || "");
    if (!language || !sessionId) return res.status(400).json({ error: "language and sessionId are required" });
    const result = await learningPath.completePlacement(
      req.authUserId,
      language,
      sessionId,
      req.body?.answers,
      await getLevelCap(req)
    );
    return res.status(result.status).json(result.body);
  });
}

module.exports = {
  createLearningPath,
  registerPathRoutes
};
