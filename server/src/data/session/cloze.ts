// Fill-in-the-blank: the gap, its answer and the words to choose from.
const {
  shuffle,
  resolveAnswer,
  stripExercisePrefix,
  isLatinScript,
  bareWord,
  sameWord,
  startsUpper,
  capitalize
} = require("./itemText.ts");

const MIN_CLOZE_DISTRACTORS = 2;

// The gap, its answer, the other words that also fit it, and the options to pick from.
// Items authored as cloze write the gap into the prompt ("___ en un pequeño restaurante.")
// and list other words that fit it in `acceptedAnswers`. Older items have no gap, so a word
// of the answer is masked, and a word at the same place in an accepted answer also fits.
// Returns null when too few options are left that are surely wrong.
function buildCloze(item, answer: string, pool, randomFn) {
  const promptText = stripExercisePrefix(item.prompt);
  const authored = Array.isArray(item.acceptedAnswers)
    ? item.acceptedAnswers.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  let clozeAnswer: string;
  let clozeText: string;
  let accepted: string[];
  let sentenceStart: boolean;
  if (/_{2,}/.test(promptText)) {
    clozeAnswer = answer;
    clozeText = promptText.replace(/_{2,}/g, "____");
    accepted = authored;
    sentenceStart = /^[^\p{L}\p{N}]*____/u.test(clozeText);
  } else {
    const answerTokens = answer.split(" ").filter(Boolean);
    const maskIndex = answerTokens.findIndex((token) => bareWord(token).length > 3);
    const masked = maskIndex >= 0 ? maskIndex : 0;
    const token = answerTokens[masked] || "";
    clozeAnswer = bareWord(token) || token;
    const tokens = [...answerTokens];
    tokens[masked] = token.replace(clozeAnswer, "____");
    clozeText = tokens.join(" ");
    accepted = authored
      .map((alternative) => alternative.split(" ").filter(Boolean))
      .filter((altTokens) =>
        altTokens.length === answerTokens.length &&
        altTokens.every((altToken, index) => index === masked || sameWord(altToken, answerTokens[index])))
      .map((altTokens) => bareWord(altTokens[masked]));
    sentenceStart = masked === 0;
  }
  const acceptedClozeAnswers = [...new Set(accepted.filter((word) => word && !sameWord(word, clozeAnswer)))];
  const fits = (word: string) => sameWord(word, clozeAnswer) || acceptedClozeAnswers.some((other) => sameWord(word, other));

  const authoredOptions = Array.isArray(item.clozeOptions)
    ? item.clozeOptions.map((option) => String(option || "").trim()).filter(Boolean)
    : [];
  let distractors: string[];
  if (authoredOptions.length >= 2) {
    distractors = authoredOptions.filter((option) => !fits(option));
  } else {
    // Distractors share the answer's script, since a handful of pool answers hold English
    // glosses that would leak Latin words into a Cyrillic exercise. They also share how it
    // starts: capitalized at the start of the sentence, and otherwise the same case as the
    // answer, so neither gives the answer away.
    const answerIsLatin = isLatinScript(clozeAnswer);
    const answerUpper = startsUpper(clozeAnswer);
    distractors = pool
      .flatMap((entry) => resolveAnswer(entry).split(" "))
      .map((token: string) => bareWord(token))
      .filter((word: string) => word.length > 2 && isLatinScript(word) === answerIsLatin && !fits(word))
      .filter((word: string) => sentenceStart || startsUpper(word) === answerUpper)
      .map((word: string) => (sentenceStart && answerUpper ? capitalize(word) : word));
  }
  const unique: string[] = [];
  for (const word of shuffle(distractors, randomFn)) {
    if (unique.length >= 3) break;
    if (!unique.some((other) => sameWord(other, word))) unique.push(word);
  }
  if (unique.length < MIN_CLOZE_DISTRACTORS) return null;

  return {
    clozeAnswer,
    clozeText,
    clozeOptions: shuffle([clozeAnswer, ...unique], randomFn),
    ...(acceptedClozeAnswers.length ? { acceptedClozeAnswers } : {})
  };
}

module.exports = { buildCloze };
