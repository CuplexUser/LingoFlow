// Wrong options for questions answered in the target language, and the punctuation every
// option shares with the answer.
const {
  shuffle,
  levelRank,
  resolveAnswer,
  resolveDifficulty,
  countWords,
  normalizeComparableText,
  isLatinScript,
  firstAlternative
} = require("./itemText.ts");

// Marks a word from another unit, added to a session's pool only as a distractor for words.
const COURSE_WORD = Symbol("courseWord");

function pickLevelAwareDistractors(pool, item, count, randomFn, language = "") {
  const answer = resolveAnswer(item);
  const normalizedAnswer = normalizeComparableText(answer);
  const answerWordCount = countWords(answer);
  const enforceSentenceLike = answerWordCount >= 4;
  if (enforceSentenceLike) pool = pool.filter((candidate) => !candidate[COURSE_WORD]);
  const ranked = levelRank(resolveDifficulty(item));
  // Distractors must be a target-language phrase that shares the answer's script. Two leaks to
  // guard against: (1) a stray Latin gloss in a non-Latin (e.g. Cyrillic) exercise — caught by
  // the script check; (2) an English gloss in a Latin-script target course (Spanish, Italian, …)
  // where the script check can't tell English from the target. Comprehension multiple_choice
  // items hold those English glosses as their correctAnswer ("a wooden nesting doll"), so drop
  // them as a distractor source in non-English courses (in an English course they ARE the target).
  const excludeMultipleChoice = String(language || "").trim().toLowerCase() !== "english";
  const answerIsLatin = isLatinScript(answer);
  // A candidate offers its first alternative, like the answer does (see firstAlternative).
  const optionOf = (candidate) => firstAlternative(resolveAnswer(candidate));
  const allCandidates = pool.filter((candidate) => {
    if (candidate?.id && candidate.id === item?.id) return false;
    if (excludeMultipleChoice && String(candidate?.exerciseType || "").trim().toLowerCase() === "multiple_choice") {
      return false;
    }
    const candidateAnswer = optionOf(candidate);
    if (normalizeComparableText(candidateAnswer) === normalizedAnswer) return false;
    return isLatinScript(candidateAnswer) === answerIsLatin;
  });

  const sameBand = allCandidates.filter(
    (candidate) => Math.abs(levelRank(resolveDifficulty(candidate)) - ranked) <= 1
  );
  const initial = sameBand.length >= count ? sameBand : allCandidates;

  const candidateWordCount = (candidate) => countWords(optionOf(candidate));
  let filtered = initial;

  if (!enforceSentenceLike) {
    // A word or short phrase among whole sentences is easy to spot, so short answers get
    // short distractors when there are enough of them.
    const short = filtered.filter((candidate) => candidateWordCount(candidate) <= answerWordCount + 1);
    if (short.length >= count) filtered = short;
  } else {
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

  const uniqueDistractors: string[] = [];
  const seenAnswers = new Set([normalizedAnswer]);
  const take = (candidate) => {
    const candidateAnswer = optionOf(candidate);
    const normalizedCandidate = normalizeComparableText(candidateAnswer);
    if (!candidateAnswer || seenAnswers.has(normalizedCandidate)) return;
    seenAnswers.add(normalizedCandidate);
    uniqueDistractors.push(candidateAnswer);
  };
  shuffle(filtered, randomFn).forEach(take);

  if (uniqueDistractors.length < count) {
    shuffle(allCandidates, randomFn).forEach((candidate) => {
      if (uniqueDistractors.length >= count) return;
      if (enforceSentenceLike && candidateWordCount(candidate) < 3) return;
      take(candidate);
    });
  }
  return uniqueDistractors.slice(0, count);
}

// Every option takes the answer's opening and closing marks, so neither gives the answer
// away, and a Spanish question never keeps its "¿" with a full stop ("¿Es vegetariano.").
function unifyOptionPunctuation(options: string[], correctAnswer: string): string[] {
  // The space French puts before "?" and "!" goes with the mark, so "lentement ?" does not
  // become "lentement ." when the answer ends in a full stop.
  const terminalPunct = /\s*[.!?¿¡]+$/;
  const openingPunct = /^[¿¡]+/;
  const match = correctAnswer.match(terminalPunct);
  if (!match) return options;
  const terminal = match[0];
  const opening = correctAnswer.match(openingPunct)?.[0] || "";
  return options.map((opt) => opening + opt.replace(terminalPunct, "").replace(openingPunct, "") + terminal);
}

module.exports = {
  COURSE_WORD,
  pickLevelAwareDistractors,
  unifyOptionPunctuation
};
