// Which items a session asks: the pool for its mode, the level it aims at, and the picks.
const { shuffle, levelRank, resolveAnswer, resolveDifficulty, countWords, normalizeExerciseType } = require("./itemText.ts");

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

function dedupeItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildPracticePool(getAllItems, language, practicePool, extraItems = []) {
  const allItems = getAllItems(language);
  const poolItems = typeof practicePool === "function"
    ? practicePool(language)
    : Array.isArray(practicePool?.[language]) ? practicePool[language] : [];
  const extras = Array.isArray(extraItems) ? extraItems : [];
  return dedupeItems([...extras, ...poolItems, ...allItems]);
}

function recommendedLevelFromMastery(mastery) {
  if (mastery < 20) return "a1";
  if (mastery < 45) return "a2";
  if (mastery < 70) return "b1";
  return "b2";
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

module.exports = {
  filterItemsForMode,
  buildPracticePool,
  recommendedLevelFromMastery,
  selectByLevelWindow,
  applyDailyCuration
};
