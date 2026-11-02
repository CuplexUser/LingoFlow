// Reading course items and comparing their text: answers, levels, word counts, scripts and
// exercise types. Shared by every part of session generation.
const { LEVEL_ORDER } = require("../constants.ts");

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

function clampLevelRank(rank) {
  return Math.max(0, Math.min(rank, LEVEL_ORDER.length - 1));
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

function stripWrappingPunctuation(token) {
  return String(token || "")
    .replace(/^[«»"“”‘’(){}.,!?;:]+/g, "")
    .replace(/[«»"“”‘’(){}.,!?;:]+$/g, "")
    .trim();
}

function tokenizeBuildWords(text) {
  return String(text || "")
    .split(/\s+/g)
    .map((token) => stripWrappingPunctuation(token))
    .filter(Boolean);
}

function restoreTrailingPunct(tokens, rawText) {
  if (!tokens.length) return tokens;
  const trailing = String(rawText || "").trimEnd().match(/[.?!]+$/)?.[0];
  if (!trailing) return tokens;
  const result = [...tokens];
  result[result.length - 1] = result[result.length - 1] + trailing;
  return result;
}

function normalizeComparableText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, "");
}

// Matches an instruction prefix like "Say:", "Choose the best response. Someone asks:", etc.
// Only strips if the prefix is all-ASCII (no target-language text before the colon).
const EXERCISE_PREFIX_RE = /^[a-zA-Z][a-zA-Z\s.,?!()]{1,60}:\s*/;

function stripExercisePrefix(text) {
  return String(text || "")
    .replace(EXERCISE_PREFIX_RE, "")
    .replace(/^["'«»]|["'«»]$/g, "")
    .trim();
}

function resolveEnglishFromPrompt(item) {
  return stripExercisePrefix(String(item?.prompt || "").trim());
}

// True when `text` contains no characters outside the Latin script (ignoring
// punctuation/whitespace) — used to keep distractor scripts matched to the answer.
function isLatinScript(text) {
  return !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(String(text || ""));
}

function isCleanEnglishText(text) {
  if (!text || text.includes("____") || text.includes("___")) return false;
  // Reject phrase-chunked sentences (e.g. "word / word / word")
  if (text.includes(' / ')) return false;
  // Reject if it contains characters from non-Latin scripts (Cyrillic, Arabic, CJK, etc.)
  return !/[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(text);
}

// The word without the punctuation around it: "¿Puedo" → "Puedo", "hambre." → "hambre".
function bareWord(token: string): string {
  return String(token || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function sameWord(a: string, b: string): boolean {
  return bareWord(a).toLocaleLowerCase() === bareWord(b).toLocaleLowerCase();
}

function startsUpper(text: string): boolean {
  const first = bareWord(text).charAt(0);
  return first !== "" && first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase();
}

function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}

// A flashcard answer may list two right answers ("перейти к делу / говорить по существу"),
// which suits the back of a card. As an option the slash would single it out, so multiple
// choice offers the first one.
function firstAlternative(answer: string): string {
  return String(answer || "").split(" / ")[0].trim();
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

module.exports = {
  shuffle,
  levelRank,
  clampLevelRank,
  resolveAnswer,
  resolveDifficulty,
  countWords,
  tokenizeBuildWords,
  restoreTrailingPunct,
  normalizeComparableText,
  EXERCISE_PREFIX_RE,
  stripExercisePrefix,
  resolveEnglishFromPrompt,
  isLatinScript,
  isCleanEnglishText,
  bareWord,
  sameWord,
  startsUpper,
  capitalize,
  firstAlternative,
  normalizeExerciseType,
  isRoleplayLikeItem
};
