const { CATEGORIES, LEVEL_ORDER, LEVEL_XP_MULTIPLIER } = require("./constants.ts");

function shuffle(items, randomFn = Math.random) {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
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

function normalizeComparableText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, "");
}

function stripExercisePrefix(text) {
  return String(text || "")
    .replace(/^say:\s*/i, "")
    .replace(/^flashcard:\s*/i, "")
    .replace(/^choose the best response\.\s*/i, "")
    .trim();
}

function normalizeExerciseType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "multiple_choice") return "mc_sentence";
  return raw;
}

function isRoleplayLikeItem(item) {
  const exerciseType = normalizeExerciseType(item?.exerciseType);
  if (exerciseType === "roleplay" || exerciseType === "dialogue_turn") {
    return true;
  }
  const prompt = String(item?.prompt || "").trim().toLowerCase();
  return prompt.startsWith("choose the best response.");
}

function filterItemsForMode(items, mode) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (!normalizedMode) return items;

  const filtered = items.filter((item) => {
    const exerciseType = normalizeExerciseType(item?.exerciseType);
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

const MISTAKE_PROFILE_BY_CATEGORY = {
  grammar: ["word_order", "grammar_or_vocab", "missing_word"],
  travel: ["wrong_option", "missing_answer"],
  work: ["word_order", "grammar_or_vocab"],
  science_technology: ["grammar_or_vocab", "wrong_option"],
  default: ["wrong_option", "missing_answer"]
};

function getMistakeProfile(category) {
  return MISTAKE_PROFILE_BY_CATEGORY[category] || MISTAKE_PROFILE_BY_CATEGORY.default;
}

function buildFallbackHint(category, questionType) {
  if (category === "grammar") {
    return "Check word order and verb form before submitting.";
  }
  if (category === "travel") {
    return "Use a clear, polite phrase you would say in a real travel situation.";
  }
  if (questionType === "build_sentence" || questionType === "dictation_sentence") {
    return "Re-read the full sentence and confirm each key word is present.";
  }
  return "Choose the most natural phrase for the context.";
}

function pickLevelAwareDistractors(pool, item, count, randomFn) {
  const answer = resolveAnswer(item);
  const normalizedAnswer = normalizeComparableText(answer);
  const answerWordCount = countWords(answer);
  const enforceSentenceLike = answerWordCount >= 4;
  const ranked = levelRank(resolveDifficulty(item));
  const allCandidates = pool.filter((candidate) => {
    const candidateAnswer = resolveAnswer(candidate);
    return normalizeComparableText(candidateAnswer) !== normalizedAnswer;
  });

  const sameBand = allCandidates.filter(
    (candidate) => Math.abs(levelRank(resolveDifficulty(candidate)) - ranked) <= 1
  );
  const initial = sameBand.length >= count ? sameBand : allCandidates;

  const candidateWordCount = (candidate) => countWords(resolveAnswer(candidate));
  let filtered = initial;

  if (enforceSentenceLike) {
    const minWords = Math.max(3, answerWordCount - 3);
    const maxWords = answerWordCount + 4;
    const nearLength = filtered.filter((candidate) => {
      const words = candidateWordCount(candidate);
      return words >= minWords && words <= maxWords;
    });
    if (nearLength.length >= count) {
      filtered = nearLength;
    } else {
      const sentenceLike = filtered.filter((candidate) => candidateWordCount(candidate) >= 3);
      if (sentenceLike.length) {
        filtered = sentenceLike;
      }
    }
  }

  const uniqueDistractors = [];
  const seenAnswers = new Set();
  shuffle(filtered, randomFn).forEach((candidate) => {
    const candidateAnswer = resolveAnswer(candidate);
    const normalizedCandidate = normalizeComparableText(candidateAnswer);
    if (!candidateAnswer || seenAnswers.has(normalizedCandidate)) return;
    seenAnswers.add(normalizedCandidate);
    uniqueDistractors.push(candidateAnswer);
  });

  if (uniqueDistractors.length < count) {
    shuffle(allCandidates, randomFn).forEach((candidate) => {
      if (uniqueDistractors.length >= count) return;
      if (enforceSentenceLike && candidateWordCount(candidate) < 3) return;
      const candidateAnswer = resolveAnswer(candidate);
      const normalizedCandidate = normalizeComparableText(candidateAnswer);
      if (!candidateAnswer || seenAnswers.has(normalizedCandidate)) return;
      seenAnswers.add(normalizedCandidate);
      uniqueDistractors.push(candidateAnswer);
    });
  }
  return uniqueDistractors.slice(0, count);
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

function buildQuestionTypePlan(items) {
  const cycle = ["mc_sentence", "build_sentence", "cloze_sentence", "dictation_sentence", "dialogue_turn"];
  let cycleIndex = 0;
  const recent: string[] = [];
  return items.map((item) => {
    const fixedType = normalizeExerciseType(item?.exerciseType);
    if (fixedType) {
      recent.push(fixedType);
      if (recent.length > 2) recent.shift();
      return fixedType;
    }
    let type = cycle[cycleIndex % cycle.length];
    cycleIndex += 1;
    if (recent.length >= 2 && recent[0] === recent[1] && recent[1] === type) {
      type = cycle[cycleIndex % cycle.length];
      cycleIndex += 1;
    }
    recent.push(type);
    if (recent.length > 2) recent.shift();
    return type;
  });
}

function createQuestion(item, pool, questionType, category, language, englishRoleplayAnswerByPrompt, randomFn) {
  const requestedType = normalizeExerciseType(item.exerciseType);
  let resolvedType = normalizeExerciseType(questionType) || requestedType || "mc_sentence";
  const answer = resolveAnswer(item);
  const answerEnglish = resolvedType === "roleplay"
    ? (language === "english"
      ? answer
      : String(englishRoleplayAnswerByPrompt?.get(String(item.prompt || "")) || "").trim())
    : "";

  // Speaking long sentences is frustrating; fall back to a non-speaking exercise.
  if (resolvedType === "pronunciation" && countWords(answer) > 7) {
    resolvedType = "build_sentence";
  }

  const base = {
    id: item.id,
    type: resolvedType,
    exerciseType: requestedType || resolvedType,
    level: item.level,
    prompt: item.prompt,
    answer,
    correctAnswer: answer,
    answerEnglish: answerEnglish || undefined,
    acceptedAnswers: buildAcceptedAnswers(answer),
    objective: deriveObjective(category, item.level),
    expectedMistakeTypes: getMistakeProfile(category),
    ...buildMediaFields(item)
  };
  if (!Array.isArray(base.hints) || !base.hints.length) {
    base.hints = [buildFallbackHint(category, resolvedType)];
  }

  if (resolvedType === "flashcard") {
    return {
      ...base,
      prompt: "Flashcard: Tap to flip",
      front: item.prompt,
      back: answer
    };
  }

  if (resolvedType === "matching") {
    const distractors = shuffle(
      pool
        .filter((candidate) => candidate.id !== item.id && !isRoleplayLikeItem(candidate))
        .map((candidate) => ({
          id: candidate.id,
          prompt: stripExercisePrefix(candidate.prompt),
          answer: resolveAnswer(candidate)
        }))
    , randomFn).slice(0, 3);
    return {
      ...base,
      prompt: "Match each phrase to its translation.",
      pairs: shuffle([{ id: item.id, prompt: stripExercisePrefix(item.prompt), answer }, ...distractors], randomFn)
    };
  }

  if (resolvedType === "pronunciation") {
    return {
      ...base,
      prompt: `${item.prompt}`,
      transcriptTarget: answer
    };
  }

  if (resolvedType === "mc_sentence") {
    const distractors = pickLevelAwareDistractors(pool, item, 3, randomFn);
    return {
      ...base,
      options: shuffle([answer, ...distractors], randomFn)
    };
  }

  if (resolvedType === "dialogue_turn" || resolvedType === "roleplay") {
    const distractors = pickLevelAwareDistractors(pool, item, 3, randomFn);
    const promptBase = String(item.prompt || "").trim();
    const normalized = promptBase.toLowerCase();
    const prefix = "choose the best response.";
    return {
      ...base,
      prompt: normalized.startsWith(prefix) ? promptBase : `${promptBase}`,
      options: shuffle([answer, ...distractors], randomFn)
    };
  }

  if (resolvedType === "cloze_sentence") {
    const answerTokens = answer.split(" ").filter(Boolean);
    const maskIndex = answerTokens.findIndex((token) => token.length > 3);
    const selectedMaskIndex = maskIndex >= 0 ? maskIndex : 0;
    const clozeAnswer = answerTokens[selectedMaskIndex];
    const fallbackDistractors = pool
      .flatMap((entry) => resolveAnswer(entry).split(" "))
      .filter((token) => token.length > 2 && token !== clozeAnswer);
    const clozeOptions = shuffle(
      [clozeAnswer, ...shuffle(fallbackDistractors, randomFn).slice(0, 3)],
      randomFn
    ).slice(0, 4);
    const clozeTokens = [...answerTokens];
    clozeTokens[selectedMaskIndex] = "____";
    return {
      ...base,
      clozeAnswer,
      clozeText: clozeTokens.join(" "),
      clozeOptions
    };
  }

  if (resolvedType === "dictation_sentence") {
    const answerTokens = answer.split(" ");
    const tokenPool = pool
      .flatMap((entry) => resolveAnswer(entry).split(" "))
      .filter((token) => token.length > 2 && !answerTokens.includes(token));
    const noise = shuffle(tokenPool, randomFn).slice(0, 2);
    return {
      ...base,
      prompt: `${item.prompt}`,
      audioText: answer,
      tokens: shuffle([...answerTokens, ...noise], randomFn)
    };
  }

  const answerTokens = answer.split(" ");
  const tokenPool = pool
    .flatMap((entry) => resolveAnswer(entry).split(" "))
    .filter((token) => token.length > 2 && !answerTokens.includes(token));
  const noise = shuffle(tokenPool, randomFn).slice(0, 2);

  return {
    ...base,
    type: "build_sentence",
    tokens: shuffle([...answerTokens, ...noise], randomFn)
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

function createPracticeListenQuestion(item, pool, randomFn) {
  const answer = resolveAnswer(item);
  const distractors = pickLevelAwareDistractors(pool, item, 3, randomFn);
  return {
    id: item.id,
    type: "practice_listen",
    exerciseType: "practice_listen",
    level: item.level,
    prompt: "Listen and choose the correct phrase.",
    answer,
    correctAnswer: answer,
    options: shuffle([answer, ...distractors], randomFn),
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

function selectByLevelWindow(items, centerRank, count, randomFn) {
  const scored = shuffle(items, randomFn)
    .map((item) => {
      const rank = levelRank(resolveDifficulty(item));
      return {
        item,
        score: Math.abs(rank - centerRank)
      };
    })
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map((entry) => entry.item);
}

function applyDailyCuration(selectedItems, sourcePool, recommendedRank, randomFn) {
  if (!selectedItems.length) return selectedItems;
  const selectedIds = new Set(selectedItems.map((item) => item.id));
  const confidence = shuffle(
    sourcePool.filter((item) => levelRank(resolveDifficulty(item)) <= recommendedRank && !selectedIds.has(item.id)),
    randomFn
  )[0];
  const stretch = shuffle(
    sourcePool.filter((item) => levelRank(resolveDifficulty(item)) > recommendedRank && !selectedIds.has(item.id)),
    randomFn
  )[0];

  const curated = [...selectedItems];
  if (confidence && curated.length >= 1) curated[0] = confidence;
  if (stretch && curated.length >= 2) curated[curated.length - 1] = stretch;
  return dedupeItems(curated);
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
    mode,
    random,
    dailyMode = false
  }) {
    const randomFn = typeof random === "function" ? random : Math.random;
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

    if (mode === "speak") {
      const speakPool = all.filter((item) =>
        normalizeExerciseType(item?.exerciseType) === "pronunciation" &&
        countWords(resolveAnswer(item)) <= 6
      );
      const selected = shuffle(speakPool.length ? speakPool : all, randomFn).slice(0, count);
      return {
        recommendedLevel: selfRatedLevel,
        difficultyMultiplier: LEVEL_XP_MULTIPLIER[selfRatedLevel] || 1,
        questions: selected.map((item) => createPracticeSpeakQuestion(item))
      };
    }

    if (mode === "listen") {
      const listenPool = all.filter((item) => countWords(resolveAnswer(item)) <= 10);
      const selected = shuffle(listenPool.length ? listenPool : all, randomFn).slice(0, count);
      return {
        recommendedLevel: selfRatedLevel,
        difficultyMultiplier: LEVEL_XP_MULTIPLIER[selfRatedLevel] || 1,
        questions: selected.map((item) => createPracticeListenQuestion(item, all, randomFn))
      };
    }

    const englishRoleplayAnswerByPrompt = new Map(
      getCategoryItems("english", category)
        .filter((item) => normalizeExerciseType(item?.exerciseType) === "roleplay")
        .map((item) => [String(item.prompt || ""), resolveAnswer(item)])
    );

    const baselineLevel = recommendedLevelFromMastery(mastery);
    let adaptiveRank = levelRank(baselineLevel);

    if (Number.isFinite(recentAccuracy)) {
      if (recentAccuracy >= 0.92) adaptiveRank += 1;
      if (recentAccuracy <= 0.45) adaptiveRank -= 1;
    }

    const selfRatedRank = levelRank(selfRatedLevel);
    if (selfRatedRank >= 0) {
      adaptiveRank = Math.max(adaptiveRank, selfRatedRank - 1);
    }

    const recommendedRank = clampLevelRank(adaptiveRank);
    const recommendedLevel = LEVEL_ORDER[recommendedRank];
    const minRank = Math.max(0, recommendedRank - 1);
    const maxRank = Math.min(recommendedRank + 1, LEVEL_ORDER.length - 1);
    const candidatePool = all.filter((item) => {
      const itemRank = levelRank(resolveDifficulty(item));
      return itemRank >= minRank && itemRank <= maxRank;
    });
    const sourcePool = candidatePool.length >= count ? candidatePool : all;
    const dueSet = new Set(dueItemIds);
    const weakSet = new Set(weakItemIds);
    const targetCount = Math.min(count, sourcePool.length);
    const dueTarget = Math.max(0, Math.min(targetCount, Math.round(targetCount * 0.6)));
    const weakTarget = Math.max(0, Math.min(targetCount - dueTarget, Math.round(targetCount * 0.25)));

    const dueItems = shuffle(sourcePool.filter((item) => dueSet.has(item.id)), randomFn).slice(0, dueTarget);
    const selectedIds = new Set(dueItems.map((item) => item.id));
    const weakItems = shuffle(
      sourcePool.filter((item) => weakSet.has(item.id) && !selectedIds.has(item.id))
    , randomFn).slice(0, weakTarget);
    weakItems.forEach((item) => selectedIds.add(item.id));

    const remaining = sourcePool.filter((item) => !selectedIds.has(item.id));
    const levelSmoothed = selectByLevelWindow(remaining, recommendedRank, Math.max(0, targetCount - dueItems.length - weakItems.length), randomFn);
    let selected = [...dueItems, ...weakItems, ...levelSmoothed].slice(0, targetCount);
    if (dailyMode) {
      selected = applyDailyCuration(selected, sourcePool, recommendedRank, randomFn).slice(0, targetCount);
    }
    const plannedTypes = buildQuestionTypePlan(selected);
    const questions = selected.map((item, idx) =>
      createQuestion(item, sourcePool, plannedTypes[idx], category, language, englishRoleplayAnswerByPrompt, randomFn)
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
