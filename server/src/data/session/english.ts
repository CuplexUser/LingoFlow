// The English side of a course item, for questions asked in reverse ("Translate to English"):
// which items have an English phrase to ask for, and English phrases to offer as wrong options.
const {
  shuffle,
  resolveAnswer,
  countWords,
  normalizeComparableText,
  EXERCISE_PREFIX_RE,
  resolveEnglishFromPrompt,
  isCleanEnglishText,
  normalizeExerciseType,
  isRoleplayLikeItem
} = require("./itemText.ts");
const { COURSE_WORD } = require("./distractors.ts");

// Exercise types whose prompt is a fixed instruction ("Listen and build…", "Fill the blank…")
// rather than a translatable English phrase. They must never supply English distractors.
const NON_TRANSLATABLE_TYPES = [
  "pronunciation",
  "flashcard",
  "cloze_sentence",
  "dictation_sentence",
  "matching",
  "roleplay",
  "dialogue_turn"
];

// multiple_choice prompts are questions ("¿Qué significa…?" / "Which word means…?"), not phrases.
function isComprehensionQuestion(item) {
  return String(item?.exerciseType || "").trim().toLowerCase() === "multiple_choice";
}

// Bare meta-questions ("How do you say X?") with no exercise prefix are instructions, not
// phrases. Prompts with an exercise prefix ("Say: Hello?") are legitimate targets.
function isBareMetaQuestion(item, englishText: string): boolean {
  const rawPrompt = String(item?.prompt || "").trim();
  return englishText.trimEnd().endsWith("?") && !EXERCISE_PREFIX_RE.test(rawPrompt);
}

// The English phrase a pool entry can contribute to an English distractor/noise pool, or
// "" if its prompt is not a plain English translatable phrase. Latin-script target languages
// (Spanish, Italian, French, …) share the Latin script with English, so a script check alone
// can't tell them apart — instead we reject the item types whose prompt is in the target
// language: roleplay/dialogue, instruction-prefixed prompts (cloze "Fill in the blank: …",
// pronunciation "Say: …"), and comprehension multiple_choice questions.
function resolveEnglishDistractorText(entry) {
  if (isRoleplayLikeItem(entry)) return "";
  const type = normalizeExerciseType(entry?.exerciseType);
  if (type && NON_TRANSLATABLE_TYPES.includes(type)) return "";
  if (isComprehensionQuestion(entry)) return "";
  const eng = resolveEnglishFromPrompt(entry);
  if (!eng || !isCleanEnglishText(eng)) return "";
  if (isBareMetaQuestion(entry, eng)) return "";
  return eng;
}

function pickEnglishDistractors(pool, item, count, randomFn) {
  const englishAnswer = resolveEnglishFromPrompt(item);
  const normalizedAnswer = normalizeComparableText(englishAnswer);
  const seen = new Set([normalizedAnswer]);
  const unique: string[] = [];
  shuffle(pool.filter((candidate) => !candidate[COURSE_WORD]), randomFn).forEach((candidate) => {
    const eng = resolveEnglishDistractorText(candidate);
    if (countWords(eng) < 2) return;
    const norm = normalizeComparableText(eng);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    unique.push(eng);
  });
  // Distractors near the answer's length, when there are enough, so it does not stand out.
  const answerWords = countWords(englishAnswer);
  const near = unique.filter((eng) => Math.abs(countWords(eng) - answerWords) <= Math.max(2, Math.round(answerWords / 2)));
  return (near.length >= count ? near : unique).slice(0, count);
}

function isEligibleForReversal(item, resolvedType, language) {
  if (language === "english") return false;
  if (isRoleplayLikeItem(item)) return false;
  if (!["mc_sentence", "build_sentence"].includes(resolvedType)) return false;
  const fixedType = normalizeExerciseType(item?.exerciseType);
  if (fixedType && NON_TRANSLATABLE_TYPES.includes(fixedType)) return false;
  if (isComprehensionQuestion(item)) return false;
  const englishText = resolveEnglishFromPrompt(item);
  if (countWords(englishText) < 2) return false;
  if (!isCleanEnglishText(englishText)) return false;
  if (isBareMetaQuestion(item, englishText)) return false;
  // Skip if English prompt text is the same as the target answer (would be a no-op)
  if (normalizeComparableText(englishText) === normalizeComparableText(resolveAnswer(item))) return false;
  return true;
}

module.exports = {
  resolveEnglishDistractorText,
  pickEnglishDistractors,
  isEligibleForReversal
};
