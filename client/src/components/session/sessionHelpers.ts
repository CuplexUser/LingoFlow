import type { SessionQuestion } from "../../types/session";

export function normalizeSentence(text: string | null | undefined): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:¿¡«»"“”‘’(){}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const LEADING_PUNCTUATION = /^[«»"“”‘’(){}.,!?;:]+/;
const TRAILING_PUNCTUATION = /[«»"“”‘’(){}.,!?;:]+$/;
const HAS_LETTER = /[\p{L}]/u;

export type WordToken = { lead: string; core: string; trail: string };

// Splits a raw whitespace-delimited token into the punctuation that wraps it and
// the word "core" in between. Hyphens inside a word (e.g. наконец-то) stay in the
// core; standalone punctuation like an em dash collapses to an empty core.
export function splitWordToken(token: string | null | undefined): WordToken {
  const raw = String(token || "");
  const lead = raw.match(LEADING_PUNCTUATION)?.[0] ?? "";
  const rest = raw.slice(lead.length);
  const trail = rest.match(TRAILING_PUNCTUATION)?.[0] ?? "";
  const core = trail ? rest.slice(0, rest.length - trail.length) : rest;
  return { lead, core, trail };
}

export function tokenHasLetter(value: string | null | undefined): boolean {
  return HAS_LETTER.test(String(value || ""));
}

function stripWrappingPunctuation(token: string): string {
  return splitWordToken(token).core.trim();
}

export function splitSentenceWords(text: string | null | undefined): string[] {
  return String(text || "")
    .split(/\s+/g)
    .map((token) => stripWrappingPunctuation(token))
    .filter(Boolean);
}

// Tokenizes a full sentence into render-ready word tokens, preserving the
// inter-token spacing as `lead`/`trail` punctuation around each clickable core.
export function tokenizeSentence(text: string | null | undefined): WordToken[] {
  return String(text || "")
    .split(/\s+/g)
    .filter(Boolean)
    .map((token) => splitWordToken(token));
}

function levenshteinDistance(left: string | null | undefined, right: string | null | undefined): number {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function similarityRatio(left: string | null | undefined, right: string | null | undefined): number {
  const a = String(left || "");
  const b = String(right || "");
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLen);
}

export function isPronunciationCloseEnough(
  expected: string | null | undefined,
  submitted: string | null | undefined,
  threshold = 0.75
): boolean {
  const normalizedExpected = normalizeSentence(expected);
  const normalizedSubmitted = normalizeSentence(submitted);
  if (!normalizedSubmitted) return false;
  if (normalizedSubmitted === normalizedExpected) return true;
  return similarityRatio(normalizedExpected, normalizedSubmitted) >= threshold;
}

export function joinBuiltWords(question: SessionQuestion, selectedTokenIndexes: number[]): string {
  return question.type === "build_sentence" || question.type === "dictation_sentence"
    ? selectedTokenIndexes.map((idx) => question.tokens?.[idx] || "").join(" ")
    : "";
}

export function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function getSpeechLanguage(language: string): string {
  if (language === "spanish") return "es-ES";
  if (language === "russian") return "ru-RU";
  if (language === "italian") return "it-IT";
  if (language === "swedish") return "sv-SE";
  if (language === "german") return "de-DE";
  if (language === "french") return "fr-FR";
  return "en-US";
}

// ISO 639-1 codes for Whisper (different from BCP-47 used by Web Speech API)
export function getWhisperLanguage(language: string): string {
  if (language === "spanish") return "es";
  if (language === "russian") return "ru";
  if (language === "italian") return "it";
  if (language === "swedish") return "sv";
  if (language === "german") return "de";
  if (language === "french") return "fr";
  return "en";
}
