// Builds a session's questions: picks the items to ask and the exercise type of each, then
// hands each item to the question builders in ./session/.
const { LEVEL_ORDER, LEVEL_XP_MULTIPLIER } = require("./constants.ts");
const {
  shuffle,
  levelRank,
  clampLevelRank,
  resolveAnswer,
  resolveDifficulty,
  countWords,
  stripExercisePrefix,
  firstAlternative,
  normalizeExerciseType
} = require("./session/itemText.ts");
const { COURSE_WORD } = require("./session/distractors.ts");
const { isEligibleForReversal } = require("./session/english.ts");
const { createQuestion } = require("./session/questions.ts");
const {
  createPracticeSpeakQuestion,
  createPracticeListenQuestion,
  createPracticeWordsQuestion
} = require("./session/practiceQuestions.ts");
const {
  filterItemsForMode,
  buildPracticePool,
  recommendedLevelFromMastery,
  selectByLevelWindow,
  applyDailyCuration
} = require("./session/itemSelection.ts");
const { buildQuestionTypePlan, restrictTypes, fitsQuestionTypes } = require("./session/typePlan.ts");
const { createCourseSelectors } = require("./session/courseSelectors.ts");

// A share of translation questions is asked from the target language into English.
const REVERSE_SHARE = 0.35;

type SessionOptions = {
  language: string;
  category: string;
  mastery?: number;
  count?: number;
  recentAccuracy?: number | null;
  selfRatedLevel?: string;
  dueItemIds?: string[];
  weakItemIds?: string[];
  notDueItemIds?: string[];
  focusItemIds?: string[];
  extraPoolItems?: any[];
  mode?: string;
  random?: () => number;
  dailyMode?: boolean;
  maxLevel?: string;
  exactLevel?: string;
  skill?: string;
  questionTypes?: string[];
};

// A session request with its defaults filled in, its random source, and the items it may ask.
type SessionRequest = Required<Omit<SessionOptions, "mode" | "random" | "recentAccuracy">> & {
  mode: string | undefined;
  recentAccuracy: number | null;
  randomFn: () => number;
  sourceItems: any[];
  all: any[];
  maxLevelRank: number;
  exactLevelRank: number;
};

function practiceResult(level: string, questions: any[]) {
  return { recommendedLevel: level, difficultyMultiplier: LEVEL_XP_MULTIPLIER[level] || 1, questions };
}

// ─── Mistake drills and practice modes ───────────────────────────────────────

// The items the learner got wrong, in the order given, each in its own unit.
function generateMistakes(request: SessionRequest) {
  const { all, focusItemIds, count, category, language, selfRatedLevel, randomFn } = request;
  const focusSet = new Set(focusItemIds);
  const focusRank = new Map(focusItemIds.map((id, index) => [id, index]));
  const selected = all
    .filter((item) => focusSet.has(item.id))
    .sort((left, right) => (focusRank.get(left.id) ?? 9999) - (focusRank.get(right.id) ?? 9999))
    .slice(0, count);

  if (!selected.length) {
    return { recommendedLevel: selfRatedLevel, questions: [] };
  }

  // A flashcard is only flipped, so a drill asks it as multiple choice.
  const plannedTypes = buildQuestionTypePlan(selected).map((type) =>
    type === "flashcard" ? "mc_sentence" : type
  );
  const questions = selected.map((item, idx) => {
    const reversed = randomFn() < REVERSE_SHARE && isEligibleForReversal(item, plannedTypes[idx], language);
    return createQuestion(item, plannedTypes[idx], {
      pool: all,
      category: item.category || category,
      language,
      englishRoleplayAnswerByPrompt: new Map(),
      randomFn
    }, reversed);
  });
  return practiceResult(selfRatedLevel, questions);
}

// One matching question of eight single words, each used once on either side.
function generateWords(request: SessionRequest) {
  const { all, randomFn } = request;
  const selected: any[] = [];
  const usedLeft = new Set();
  const usedRight = new Set();
  const wordPools = [
    all.filter((item) => countWords(resolveAnswer(item)) <= 1),
    all.filter((item) => countWords(resolveAnswer(item)) <= 2),
    all.filter((item) => countWords(resolveAnswer(item)) <= 3),
    all
  ];

  wordPools.forEach((pool) => {
    shuffle(pool, randomFn).forEach((item) => {
      if (selected.length >= 8) return;
      const left = resolveAnswer(item);
      const right = stripExercisePrefix(item.prompt || "");
      if (!left || !right || left === right) return;
      if (countWords(left) > 1 || countWords(right) > 1) return;
      if (usedLeft.has(left) || usedRight.has(right)) return;
      usedLeft.add(left);
      usedRight.add(right);
      selected.push(item);
    });
  });

  if (selected.length < 8) {
    return { recommendedLevel: "a1", questions: [] };
  }
  return {
    recommendedLevel: "a1",
    difficultyMultiplier: LEVEL_XP_MULTIPLIER.a1,
    questions: [createPracticeWordsQuestion(selected)]
  };
}

function generateSpeak(request: SessionRequest) {
  const { all, count, selfRatedLevel, randomFn } = request;
  const speakPool = all.filter((item) =>
    normalizeExerciseType(item?.exerciseType) === "pronunciation" &&
    countWords(resolveAnswer(item)) <= 6
  );
  const selected = shuffle(speakPool.length ? speakPool : all, randomFn).slice(0, count);
  return practiceResult(selfRatedLevel, selected.map((item) => createPracticeSpeakQuestion(item)));
}

function generateListen(request: SessionRequest) {
  const { all, count, selfRatedLevel, language, randomFn } = request;
  const listenPool = all.filter((item) => countWords(resolveAnswer(item)) <= 10);
  const selected = shuffle(listenPool.length ? listenPool : all, randomFn).slice(0, count);
  return practiceResult(
    selfRatedLevel,
    selected.map((item) => createPracticeListenQuestion(item, all, randomFn, language))
  );
}

// ─── Lessons, daily sessions and checks ──────────────────────────────────────

// The level a lesson aims at: from mastery, nudged by recent accuracy, at most one below
// the learner's own rating, and kept to a pinned level or the free-tier cap.
function recommendedRankFor(request: SessionRequest): number {
  const { mastery, recentAccuracy, selfRatedLevel, maxLevelRank, exactLevelRank } = request;
  if (exactLevelRank >= 0) return exactLevelRank;
  let adaptiveRank = levelRank(recommendedLevelFromMastery(mastery));
  if (typeof recentAccuracy === "number" && Number.isFinite(recentAccuracy)) {
    if (recentAccuracy >= 0.92) adaptiveRank += 1;
    if (recentAccuracy <= 0.45) adaptiveRank -= 1;
  }
  const selfRatedRank = levelRank(selfRatedLevel);
  if (selfRatedRank >= 0) {
    adaptiveRank = Math.max(adaptiveRank, selfRatedRank - 1);
  }
  return maxLevelRank < 0
    ? clampLevelRank(adaptiveRank)
    : Math.min(clampLevelRank(adaptiveRank), maxLevelRank);
}

// The items a lesson asks: due ones first, then weak ones, then the rest nearest its level.
function selectLessonItems(request: SessionRequest, recommendedRank: number) {
  const { all, count, dueItemIds, weakItemIds, notDueItemIds, skill, dailyMode, randomFn } = request;
  const minRank = Math.max(0, recommendedRank - 1);
  const maxRank = Math.min(recommendedRank + 1, LEVEL_ORDER.length - 1);
  const candidatePool = all.filter((item) => {
    const itemRank = levelRank(resolveDifficulty(item));
    return itemRank >= minRank && itemRank <= maxRank;
  });
  const sourcePool = candidatePool.length >= count ? candidatePool : all;
  const dueSet = new Set(dueItemIds);
  const weakSet = new Set(weakItemIds);
  const notDueSet = new Set(notDueItemIds);
  const targetCount = Math.min(count, sourcePool.length);
  const dueTarget = Math.max(0, Math.min(targetCount, Math.round(targetCount * 0.6)));
  const weakTarget = Math.max(0, Math.min(targetCount - dueTarget, Math.round(targetCount * 0.25)));

  const dueItems = shuffle(sourcePool.filter((item) => dueSet.has(item.id)), randomFn).slice(0, dueTarget);
  const selectedIds = new Set(dueItems.map((item) => item.id));
  const weakItems = shuffle(
    sourcePool.filter((item) => weakSet.has(item.id) && !selectedIds.has(item.id) && !notDueSet.has(item.id))
    , randomFn).slice(0, weakTarget);
  weakItems.forEach((item) => selectedIds.add(item.id));

  const remaining = sourcePool.filter((item) => !selectedIds.has(item.id) && !notDueSet.has(item.id));
  const levelSmoothed = selectByLevelWindow(remaining, recommendedRank, Math.max(0, targetCount - dueItems.length - weakItems.length), randomFn);
  let selected = [...dueItems, ...weakItems, ...levelSmoothed].slice(0, targetCount);
  if (skill && selected.length < targetCount) {
    // A skill has only a handful of items, and once it's known none of them are due, so
    // practicing it tops up with the items that aren't due yet.
    const picked = new Set(selected.map((item) => item.id));
    const rest = shuffle(sourcePool.filter((item) => !picked.has(item.id)), randomFn);
    selected = [...selected, ...rest].slice(0, targetCount);
  }
  if (dailyMode) {
    // The confidence and stretch picks honor the exclusions too.
    const curationPool = sourcePool.filter((item) => !notDueSet.has(item.id));
    selected = applyDailyCuration(selected, curationPool, recommendedRank, randomFn).slice(0, targetCount);
  }
  return { selected, sourcePool };
}

// Where a lesson's distractors and noise words come from. A skill has only a handful of
// items, too few to draw them from, so a session kept to one skill or level takes them from
// its whole unit. Distractors still prefer items near the question's level. A unit also has
// only a word or two per level, so a word asked as multiple choice takes its distractors
// from the words of the whole course rather than stand alone among sentences.
function lessonOptionPool(request: SessionRequest, sourcePool: any[], getAllItems) {
  const { sourceItems, mode, skill, language, maxLevelRank, exactLevelRank } = request;
  const withinCap = (item) => maxLevelRank < 0 || levelRank(resolveDifficulty(item)) <= maxLevelRank;
  const unitPool = skill || exactLevelRank >= 0
    ? filterItemsForMode(sourceItems, mode).filter(withinCap)
    : sourcePool;
  const unitIds = new Set(unitPool.map((item) => item.id));
  const courseWords = getAllItems(language)
    .filter((item) =>
      !unitIds.has(item.id) && withinCap(item) && countWords(firstAlternative(resolveAnswer(item))) <= 3
    )
    .map((item) => ({ ...item, [COURSE_WORD]: true }));
  return [...unitPool, ...courseWords];
}

// The English answers of the English course's roleplay items, by prompt: what a roleplay
// question in another course shows as its English meaning.
function englishRoleplayAnswers(getCategoryItems, category: string): Map<string, string> {
  return new Map(
    getCategoryItems("english", category)
      .filter((item) => normalizeExerciseType(item?.exerciseType) === "roleplay")
      .map((item) => [String(item.prompt || ""), resolveAnswer(item)])
  );
}

function generateLesson(request: SessionRequest, getCategoryItems, getAllItems) {
  const { category, language, questionTypes, randomFn } = request;
  const englishRoleplayAnswerByPrompt = englishRoleplayAnswers(getCategoryItems, category);
  const recommendedRank = recommendedRankFor(request);
  const recommendedLevel = LEVEL_ORDER[recommendedRank];
  const { selected, sourcePool } = selectLessonItems(request, recommendedRank);
  const plannedTypes = restrictTypes(buildQuestionTypePlan(selected), questionTypes);
  const context = {
    pool: lessonOptionPool(request, sourcePool, getAllItems),
    category,
    language,
    englishRoleplayAnswerByPrompt,
    randomFn
  };
  const questions = selected.map((item, idx) => {
    const reversed = randomFn() < REVERSE_SHARE && isEligibleForReversal(item, plannedTypes[idx], language);
    return createQuestion(item, plannedTypes[idx], context, reversed);
  });

  return {
    recommendedLevel,
    difficultyMultiplier: LEVEL_XP_MULTIPLIER[recommendedLevel],
    questions
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// Modes with a generator of their own. Any other mode is a lesson drawn from the practice pool.
const MODE_GENERATORS = new Map<string, (request: SessionRequest) => any>([
  ["mistakes", generateMistakes],
  ["words", generateWords],
  ["speak", generateSpeak],
  ["listen", generateListen]
]);

function createSessionGenerator(getCategoryItems, getAllItems, practicePool) {
  return function generateSession({
    language,
    category,
    mastery = 0,
    count = 10,
    recentAccuracy = null,
    selfRatedLevel = "a1",
    dueItemIds = [],
    weakItemIds = [],
    notDueItemIds = [],
    focusItemIds = [],
    extraPoolItems = [],
    mode,
    random,
    dailyMode = false,
    maxLevel = "",
    exactLevel = "",
    skill = "",
    questionTypes = []
  }: SessionOptions) {
    const randomFn = typeof random === "function" ? random : Math.random;
    const sourceItems = mode
      ? buildPracticePool(getAllItems, language, practicePool, extraPoolItems)
      : getCategoryItems(language, category);
    // maxLevel caps content for free-tier app users; levels above it never reach the pool.
    // exactLevel pins a learning-path lesson to its unit's level, and skill keeps only the
    // items that teach one skill.
    const maxLevelRank = levelRank(maxLevel);
    const exactLevelRank = levelRank(exactLevel);
    const all = filterItemsForMode(sourceItems, mode).filter((item) => {
      const rank = levelRank(resolveDifficulty(item));
      return (maxLevelRank < 0 || rank <= maxLevelRank) &&
        (exactLevelRank < 0 || rank === exactLevelRank) &&
        (!skill || (Array.isArray(item.skills) && item.skills.includes(skill))) &&
        fitsQuestionTypes(item, questionTypes);
    });
    if (!all.length) {
      return { recommendedLevel: "a1", questions: [] };
    }

    const request: SessionRequest = {
      language, category, mastery, count, recentAccuracy, selfRatedLevel, dueItemIds, weakItemIds,
      notDueItemIds, focusItemIds, extraPoolItems, mode, dailyMode, maxLevel, exactLevel, skill,
      questionTypes, randomFn, sourceItems, all, maxLevelRank, exactLevelRank
    };
    const generateForMode = mode ? MODE_GENERATORS.get(mode) : undefined;
    return generateForMode ? generateForMode(request) : generateLesson(request, getCategoryItems, getAllItems);
  };
}

module.exports = {
  createCourseSelectors,
  createSessionGenerator,
  levelRank,
  recommendedLevelFromMastery
};
