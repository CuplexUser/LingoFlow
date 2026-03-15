const { CATEGORIES, LEVEL_ORDER, LEVEL_XP_MULTIPLIER } = require("./constants.ts");

function shuffle(items) {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function levelRank(level) {
  return LEVEL_ORDER.indexOf(level);
}

function resolveAnswer(item) {
  return String(item?.target || item?.correctAnswer || "").trim();
}

function resolveDifficulty(item) {
  return String(item?.difficulty || item?.level || "a1").trim().toLowerCase();
}

function countWords(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/g).filter(Boolean).length;
}

function stripExercisePrefix(text) {
  return String(text || "")
    .replace(/^say:\s*/i, "")
    .replace(/^flashcard:\s*/i, "")
    .replace(/^choose the best response\.\s*/i, "")
    .trim();
}

function filterItemsForMode(items, mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (!normalizedMode) return items;

  const filtered = items.filter((item) => {
    const exerciseType = String(item?.exerciseType || "").trim().toLowerCase();
    if (normalizedMode === "speak") {
      return exerciseType === "pronunciation" && countWords(resolveAnswer(item)) <= 6;
    }
    if (normalizedMode === "listen") {
      return countWords(resolveAnswer(item)) > 0;
    }
    if (normalizedMode === "words") {
      return countWords(resolveAnswer(item)) <= 1;
    }
    return true;
  });

  if (filtered.length < Math.min(4, items.length)) {
    return items;
  }
  return filtered;
}

function buildMediaFields(item) {
  return {
    hints: Array.isArray(item?.hints) ? item.hints : [],
    audioUrl: String(item?.audioUrl || ""),
    imageUrl: String(item?.imageUrl || ""),
    culturalNote: String(item?.culturalNote || "")
  };
}

function recommendedLevelFromMastery(mastery) {
  if (mastery < 20) return "a1";
  if (mastery < 45) return "a2";
  if (mastery < 70) return "b1";
  return "b2";
}

function clampLevelRank(rank) {
  return Math.max(0, Math.min(rank, LEVEL_ORDER.length - 1));
}

function createCourseSelectors(course) {
  function getCategoryItems(language, category) {
    return course[language]?.[category] || [];
  }

  function getAllItems(language) {
    const catalog = course[language] || {};
    return CATEGORIES.flatMap((category) => catalog[category.id] || []);
  }

  function getCourseOverview(language) {
    const catalog = course[language] || {};
    return CATEGORIES.map((category) => {
      const items = catalog[category.id] || [];
      const levels = Array.from(new Set(items.map((item) => item.level))).sort(
        (a, b) => levelRank(a) - levelRank(b)
      );
      return {
        ...category,
        totalPhrases: items.length,
        levels,
        mediaRichCount: items.filter((item) => item.audioUrl || item.imageUrl).length,
        sampleCulturalNotes: items
          .map((item) => String(item.culturalNote || "").trim())
          .filter(Boolean)
          .slice(0, 2)
      };
    });
  }

  return {
    getCategoryItems,
    getAllItems,
    getCourseOverview
  };
}

function buildAcceptedAnswers(target) {
  const compact = String(target || "").trim();
  if (!compact) return [];
  const noTrailingPunctuation = compact.replace(/[.!?]+$/g, "");
  if (noTrailingPunctuation !== compact) {
    return [noTrailingPunctuation];
  }
  return [];
}

function deriveObjective(category, level) {
  if (category === "grammar") {
    if (level === "a1") return "present-and-past-basics";
    if (level === "a2") return "future-and-conditionals";
    if (level === "b1") return "perfect-and-hypothetical";
    return "advanced-complex-tenses";
  }
  return `${category}-${level}-communication`;
}

function pickLevelAwareDistractors(pool, item, count) {
  const ranked = levelRank(resolveDifficulty(item));
  const sameBand = pool.filter(
    (candidate) =>
      resolveAnswer(candidate) !== resolveAnswer(item) &&
      Math.abs(levelRank(resolveDifficulty(candidate)) - ranked) <= 1
  );
  const source = sameBand.length >= count
    ? sameBand
    : pool.filter((candidate) => resolveAnswer(candidate) !== resolveAnswer(item));
  return shuffle(source.map((candidate) => resolveAnswer(candidate))).slice(0, count);
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildPracticePool(getAllItems, language, practicePool) {
  const allItems = getAllItems(language);
  const poolItems = typeof practicePool === "function"
    ? practicePool(language)
    : Array.isArray(practicePool?.[language]) ? practicePool[language] : [];
  return dedupeItems([...poolItems, ...allItems]);
}

function createQuestion(item, pool, idx, category, language, englishRoleplayAnswerByPrompt) {
  const questionTypeCycle = [
    "mc_sentence",
    "build_sentence",
    "cloze_sentence",
    "dictation_sentence",
    "dialogue_turn"
  ];
  const requestedType = String(item.exerciseType || "").trim().toLowerCase();
  let questionType = requestedType || questionTypeCycle[idx % questionTypeCycle.length];
  const answer = resolveAnswer(item);
  const answerEnglish = questionType === "roleplay"
    ? (language === "english"
      ? answer
      : String(englishRoleplayAnswerByPrompt?.get(String(item.prompt || "")) || "").trim())
    : "";

  // Speaking long sentences is frustrating; fall back to a non-speaking exercise.
  if (questionType === "pronunciation" && countWords(answer) > 7) {
    questionType = "build_sentence";
  }

  const base = {
    id: item.id,
    type: questionType,
    exerciseType: requestedType || questionType,
    level: item.level,
    prompt: item.prompt,
    answer,
    correctAnswer: answer,
    answerEnglish: answerEnglish || undefined,
    acceptedAnswers: buildAcceptedAnswers(answer),
    objective: deriveObjective(category, item.level),
    ...buildMediaFields(item)
  };

  if (questionType === "flashcard") {
    return {
      ...base,
      prompt: "Flashcard: Tap to flip",
      front: item.prompt,
      back: answer
    };
  }

  if (questionType === "matching") {
    const distractors = shuffle(
      pool
        .filter((candidate) => candidate.id !== item.id)
        .map((candidate) => ({
          id: candidate.id,
          prompt: stripExercisePrefix(candidate.prompt),
          answer: resolveAnswer(candidate)
        }))
    ).slice(0, 3);
    return {
      ...base,
      prompt: "Match each phrase to its translation.",
      pairs: shuffle([{ id: item.id, prompt: stripExercisePrefix(item.prompt), answer }, ...distractors])
    };
  }

  if (questionType === "pronunciation") {
    return {
      ...base,
      prompt: `${item.prompt}`,
      transcriptTarget: answer
    };
  }

  if (questionType === "mc_sentence") {
    const distractors = pickLevelAwareDistractors(pool, item, 3);
    return {
      ...base,
      options: shuffle([answer, ...distractors])
    };
  }

  if (questionType === "dialogue_turn" || questionType === "roleplay") {
    const distractors = pickLevelAwareDistractors(pool, item, 3);
    const promptBase = String(item.prompt || "").trim();
    const normalized = promptBase.toLowerCase();
    const prefix = "choose the best response.";
    return {
      ...base,
      prompt: normalized.startsWith(prefix) ? promptBase : `${promptBase}`,
      options: shuffle([answer, ...distractors])
    };
  }

  if (questionType === "cloze_sentence") {
    const answerTokens = answer.split(" ").filter(Boolean);
    const maskIndex = answerTokens.findIndex((token) => token.length > 3);
    const selectedMaskIndex = maskIndex >= 0 ? maskIndex : 0;
    const clozeAnswer = answerTokens[selectedMaskIndex];
    const fallbackDistractors = pool
      .flatMap((entry) => resolveAnswer(entry).split(" "))
      .filter((token) => token.length > 2 && token !== clozeAnswer);
    const clozeOptions = shuffle([clozeAnswer, ...shuffle(fallbackDistractors).slice(0, 3)]).slice(0, 4);
    const clozeTokens = [...answerTokens];
    clozeTokens[selectedMaskIndex] = "____";
    return {
      ...base,
      clozeAnswer,
      clozeText: clozeTokens.join(" "),
      clozeOptions
    };
  }

  if (questionType === "dictation_sentence") {
    const answerTokens = answer.split(" ");
    const tokenPool = pool
      .flatMap((entry) => resolveAnswer(entry).split(" "))
      .filter((token) => token.length > 2 && !answerTokens.includes(token));
    const noise = shuffle(tokenPool).slice(0, 2);
    return {
      ...base,
      prompt: `${item.prompt}`,
      audioText: answer,
      tokens: shuffle([...answerTokens, ...noise])
    };
  }

  const answerTokens = answer.split(" ");
  const tokenPool = pool
    .flatMap((entry) => resolveAnswer(entry).split(" "))
    .filter((token) => token.length > 2 && !answerTokens.includes(token));
  const noise = shuffle(tokenPool).slice(0, 2);

  return {
    ...base,
    type: "build_sentence",
    tokens: shuffle([...answerTokens, ...noise])
  };
}

function createPracticeSpeakQuestion(item) {
  const answer = resolveAnswer(item);
  return {
    id: item.id,
    type: "practice_speak",
    exerciseType: "practice_speak",
    level: item.level,
    prompt: "Pronounce the phrase.",
    answer,
    correctAnswer: answer,
    acceptedAnswers: buildAcceptedAnswers(answer),
    objective: "practice-speak",
    ...buildMediaFields(item)
  };
}

function createPracticeListenQuestion(item, pool) {
  const answer = resolveAnswer(item);
  const distractors = pickLevelAwareDistractors(pool, item, 3);
  return {
    id: item.id,
    type: "practice_listen",
    exerciseType: "practice_listen",
    level: item.level,
    prompt: "Listen and choose the correct phrase.",
    answer,
    correctAnswer: answer,
    options: shuffle([answer, ...distractors]),
    acceptedAnswers: buildAcceptedAnswers(answer),
    objective: "practice-listen",
    ...buildMediaFields(item)
  };
}

function createPracticeWordsQuestion(items) {
  const pairs = items.map((item) => ({
    left: resolveAnswer(item),
    right: stripExercisePrefix(item.prompt || "")
  })).filter((pair) => pair.left && pair.right && pair.left !== pair.right);

  return {
    id: `practice-words-${Date.now()}`,
    type: "practice_words",
    exerciseType: "practice_words",
    level: "a1",
    prompt: "Match each word to its translation.",
    pairs
  };
}

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
    mode
  }) {
    const isPracticeMode = Boolean(mode);
    const sourceItems = isPracticeMode
      ? buildPracticePool(getAllItems, language, practicePool)
      : getCategoryItems(language, category);
    const all = filterItemsForMode(sourceItems, mode);
    if (!all.length) {
      return {
        recommendedLevel: "a1",
        questions: []
      };
    }

    if (mode === "words") {
      const selected = [];
      const usedLeft = new Set();
      const usedRight = new Set();
      const wordPools = [
        all.filter((item) => countWords(resolveAnswer(item)) <= 1),
        all.filter((item) => countWords(resolveAnswer(item)) <= 2),
        all.filter((item) => countWords(resolveAnswer(item)) <= 3),
        all
      ];

      wordPools.forEach((pool) => {
        shuffle(pool).forEach((item) => {
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

    if (mode === "speak") {
      const speakPool = all.filter((item) =>
        String(item?.exerciseType || "").trim().toLowerCase() === "pronunciation" &&
        countWords(resolveAnswer(item)) <= 6
      );
      const selected = shuffle(speakPool.length ? speakPool : all).slice(0, count);
      return {
        recommendedLevel: selfRatedLevel,
        difficultyMultiplier: LEVEL_XP_MULTIPLIER[selfRatedLevel] || 1,
        questions: selected.map((item) => createPracticeSpeakQuestion(item))
      };
    }

    if (mode === "listen") {
      const listenPool = all.filter((item) => countWords(resolveAnswer(item)) <= 10);
      const selected = shuffle(listenPool.length ? listenPool : all).slice(0, count);
      return {
        recommendedLevel: selfRatedLevel,
        difficultyMultiplier: LEVEL_XP_MULTIPLIER[selfRatedLevel] || 1,
        questions: selected.map((item) => createPracticeListenQuestion(item, all))
      };
    }

    const englishRoleplayAnswerByPrompt = new Map(
      getCategoryItems("english", category)
        .filter((item) => String(item?.exerciseType || "").trim().toLowerCase() === "roleplay")
        .map((item) => [String(item.prompt || ""), resolveAnswer(item)])
    );

    const baselineLevel = recommendedLevelFromMastery(mastery);
    let adaptiveRank = levelRank(baselineLevel);

    if (Number.isFinite(recentAccuracy)) {
      if (recentAccuracy >= 0.88) adaptiveRank += 1;
      if (recentAccuracy <= 0.55) adaptiveRank -= 1;
    }

    const selfRatedRank = levelRank(selfRatedLevel);
    if (selfRatedRank >= 0) {
      adaptiveRank = Math.max(adaptiveRank, selfRatedRank - 1);
    }

    const recommendedLevel = LEVEL_ORDER[clampLevelRank(adaptiveRank)];
    const maxRank = Math.min(clampLevelRank(adaptiveRank) + 1, LEVEL_ORDER.length - 1);
    const candidatePool = all.filter((item) => levelRank(resolveDifficulty(item)) <= maxRank);
    const sourcePool = candidatePool.length >= count ? candidatePool : all;
    const dueSet = new Set(dueItemIds);
    const weakSet = new Set(weakItemIds);
    const targetCount = Math.min(count, sourcePool.length);
    const dueTarget = Math.max(0, Math.min(targetCount, Math.round(targetCount * 0.6)));
    const weakTarget = Math.max(0, Math.min(targetCount - dueTarget, Math.round(targetCount * 0.25)));

    const dueItems = shuffle(sourcePool.filter((item) => dueSet.has(item.id))).slice(0, dueTarget);
    const selectedIds = new Set(dueItems.map((item) => item.id));
    const weakItems = shuffle(
      sourcePool.filter((item) => weakSet.has(item.id) && !selectedIds.has(item.id))
    ).slice(0, weakTarget);
    weakItems.forEach((item) => selectedIds.add(item.id));

    const remaining = shuffle(sourcePool.filter((item) => !selectedIds.has(item.id)));
    const selected = [...dueItems, ...weakItems, ...remaining].slice(0, targetCount);
    const questions = selected.map((item, idx) =>
      createQuestion(item, sourcePool, idx, category, language, englishRoleplayAnswerByPrompt)
    );

    return {
      recommendedLevel,
      difficultyMultiplier: LEVEL_XP_MULTIPLIER[recommendedLevel],
      questions
    };
  };
}

module.exports = {
  createCourseSelectors,
  createSessionGenerator,
  levelRank,
  recommendedLevelFromMastery
};
