// Turns a course item into a question of a given exercise type: the fields every question
// shares, then one builder per type.
const { fallbackSkillId } = require("../skills.ts");
const {
  shuffle,
  resolveAnswer,
  resolveDifficulty,
  countWords,
  tokenizeBuildWords,
  restoreTrailingPunct,
  normalizeComparableText,
  EXERCISE_PREFIX_RE,
  stripExercisePrefix,
  resolveEnglishFromPrompt,
  normalizeExerciseType,
  isRoleplayLikeItem
} = require("./itemText.ts");
const { pickLevelAwareDistractors, unifyOptionPunctuation } = require("./distractors.ts");
const { resolveEnglishDistractorText, pickEnglishDistractors, isEligibleForReversal } = require("./english.ts");
const { buildCloze } = require("./cloze.ts");

// What a question needs besides its item: the pool its distractors and noise words come
// from, the unit it belongs to, the course language, English roleplay answers by prompt,
// and the random source.
type QuestionContext = {
  pool: any[];
  category: string;
  language: string;
  englishRoleplayAnswerByPrompt: Map<string, string>;
  randomFn: () => number;
};

function buildMediaFields(item) {
  return {
    hints: Array.isArray(item?.hints) ? item.hints : [],
    audioUrl: String(item?.audioUrl || ""),
    imageUrl: String(item?.imageUrl || ""),
    culturalNote: String(item?.culturalNote || ""),
    wordGlossary:
      item?.wordGlossary !== null &&
      typeof item?.wordGlossary === "object" &&
      !Array.isArray(item?.wordGlossary)
        ? (item.wordGlossary as Record<string, string>)
        : undefined
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

// Alternatives an item lists itself (e.g. the feminine "Я забыла…" next to "Я забыл…"),
// each also accepted without its trailing punctuation.
function buildAuthoredAcceptedAnswers(item) {
  const authored = Array.isArray(item?.acceptedAnswers) ? item.acceptedAnswers : [];
  return authored
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .flatMap((value) => [value, ...buildAcceptedAnswers(value)]);
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

// Hints written for the back of a flashcard often name the answer ("Both are common;
// 'перейти к делу' is idiomatic…"). Shown next to the options they would give it away.
function hintsNotNaming(hints: string[], answer: string): string[] {
  // Whole words only, so "¡Uno!" and "an ett-word" name "uno" and "ett", and "dog" is not "do".
  const words = (text: string) => ` ${String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const alternatives = String(answer || "")
    .split(" / ")
    .map((alternative) => words(alternative))
    .filter((alternative) => alternative.trim());
  return hints.filter((hint) => !alternatives.some((alternative) => words(hint).includes(alternative)));
}

// The prompt and answer multiple choice asks for an item. A slash answer either lists right
// answers to one prompt ("to get to the point" → "перейти к делу / говорить по существу"),
// which gives the first, or pairs off with a slash prompt ("Vocabulary: meat / fish" →
// "мясо / рыба"), which gives the first pair ("Vocabulary: meat" → "мясо").
function singleAnswerOf(prompt: string, answer: string): { prompt: string; answer: string } {
  const answers = String(answer || "").split(" / ").map((part) => part.trim());
  if (answers.length < 2) return { prompt, answer };
  const prefix = String(prompt || "").match(EXERCISE_PREFIX_RE)?.[0] || "";
  const prompts = String(prompt || "").slice(prefix.length).split(" / ").map((part) => part.trim());
  if (prompts.length === answers.length) return { prompt: `${prefix}${prompts[0]}`, answer: answers[0] };
  return { prompt, answer: answers[0] };
}

// A word-choice item lists its choices as the prompt and asks its question in the hint:
// "désolé / content / affamé / fatigué" with "Which word do you use to apologize?". Asked
// as it stands, the answer would be the one option that also appears in the prompt.
function wordChoiceOf(item, answer: string): { question: string; choices: string[] } | null {
  const choices = String(item?.prompt || "").split(" / ").map((choice) => choice.trim());
  const question = Array.isArray(item?.hints) ? String(item.hints[0] || "").trim() : "";
  if (choices.length < 3 || !question) return null;
  const target = normalizeComparableText(answer);
  return choices.some((choice) => normalizeComparableText(choice) === target) ? { question, choices } : null;
}

function buildDictationPrompt(itemPrompt, answer) {
  const rawPrompt = String(itemPrompt || "").trim();
  const cleanedAnswer = String(answer || "").trim();
  if (!rawPrompt) {
    return "Listen and build the sentence you hear.";
  }

  const prefixPattern = /^(listen and (?:type|build):|dictation:|say aloud:)\s*/i;
  if (!prefixPattern.test(rawPrompt)) {
    return rawPrompt;
  }

  const tail = rawPrompt.replace(prefixPattern, "").trim();
  const normalizedTail = normalizeComparableText(tail);
  const normalizedAnswer = normalizeComparableText(cleanedAnswer);

  if (!tail || normalizedTail === normalizedAnswer) {
    return "Listen and build the sentence you hear.";
  }

  return `Listen and build. Translation: ${tail}`;
}

// A reverse question asks for the English prompt, offering English options or words.
function reverseFields(answer: string, englishAnswer: string) {
  return {
    prompt: "Translate to English",
    direction: "reverse",
    sourceText: answer,
    answer: englishAnswer,
    correctAnswer: englishAnswer,
    acceptedAnswers: buildAcceptedAnswers(englishAnswer)
  };
}

// Answer words plus a few noise words from the pool.
function answerTokensOf(text: string) {
  return restoreTrailingPunct(tokenizeBuildWords(text), text);
}

function poolTokens(pool) {
  return pool.flatMap((entry) => tokenizeBuildWords(resolveAnswer(entry)));
}

// ─── Builders, one per exercise type ─────────────────────────────────────────

function flashcardQuestion(base, item, answer) {
  return {
    ...base,
    prompt: "Flashcard: Tap to flip",
    front: item.prompt,
    back: answer
  };
}

const LONG_ANSWER_TYPES = new Set(["build_sentence", "dictation_sentence", "cloze_sentence", "pronunciation"]);

function matchingQuestion(base, item, answer, { pool, randomFn }: QuestionContext) {
  const distractors = shuffle(
    pool
      .filter((candidate) => {
        if (candidate.id === item.id || isRoleplayLikeItem(candidate)) return false;
        if (LONG_ANSWER_TYPES.has(normalizeExerciseType(candidate.exerciseType))) return false;
        return countWords(resolveAnswer(candidate)) >= 1 && countWords(resolveAnswer(candidate)) <= 3;
      })
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

function pronunciationQuestion(base, item, answer) {
  return {
    ...base,
    prompt: `${item.prompt}`,
    transcriptTarget: answer
  };
}

function multipleChoiceQuestion(base, item, answer, context: QuestionContext, reversed: boolean) {
  const { pool, language, randomFn } = context;
  if (reversed && isEligibleForReversal(item, "mc_sentence", language)) {
    const englishAnswer = resolveEnglishFromPrompt(item);
    const distractors = pickEnglishDistractors(pool, item, 3, randomFn);
    const options = shuffle([englishAnswer, ...distractors], randomFn);
    return { ...base, ...reverseFields(answer, englishAnswer), options };
  }
  const authoredOptions = Array.isArray(item.options) && item.options.length >= 2
    ? item.options.map((o) => String(o || "")).filter(Boolean)
    : null;
  if (authoredOptions) {
    const distractors = authoredOptions.filter((o) => o !== answer).slice(0, 3);
    return {
      ...base,
      options: unifyOptionPunctuation(shuffle([answer, ...distractors], randomFn), answer)
    };
  }
  const wordChoice = wordChoiceOf(item, answer);
  if (wordChoice) {
    return {
      ...base,
      prompt: wordChoice.question,
      hints: base.hints.slice(1),
      options: shuffle(wordChoice.choices, randomFn)
    };
  }
  const single = singleAnswerOf(String(item.prompt || ""), answer);
  const shown = single.answer;
  const distractors = pickLevelAwareDistractors(pool, { ...item, target: shown }, 3, randomFn, language);
  return {
    ...base,
    ...(shown !== answer
      ? { prompt: single.prompt, answer: shown, correctAnswer: shown, acceptedAnswers: buildAcceptedAnswers(shown) }
      : {}),
    options: unifyOptionPunctuation(shuffle([shown, ...distractors], randomFn), shown)
  };
}

function dialogueQuestion(base, item, answer, { pool, language, randomFn }: QuestionContext) {
  const distractors = pickLevelAwareDistractors(pool, item, 3, randomFn, language);
  return {
    ...base,
    prompt: String(item.prompt || "").trim(),
    options: shuffle([answer, ...distractors], randomFn)
  };
}

function clozeQuestion(base, item, answer, context: QuestionContext) {
  const cloze = buildCloze(item, answer, context.pool, context.randomFn);
  if (!cloze) return createQuestion(item, "mc_sentence", context);
  return {
    ...base,
    ...cloze,
    ...(item.translation ? { translation: String(item.translation) } : {})
  };
}

function dictationQuestion(base, item, answer, { pool, randomFn }: QuestionContext) {
  const answerTokens = answerTokensOf(answer);
  const tokenPool = poolTokens(pool).filter((token) => token.length > 2 && !answerTokens.includes(token));
  const noise = shuffle(tokenPool, randomFn).slice(0, 2);
  return {
    ...base,
    prompt: buildDictationPrompt(item.prompt, answer),
    audioText: answer,
    tokens: shuffle([...answerTokens, ...noise], randomFn)
  };
}

// Without a punctuation mark at the end, lowercased: how answer words are compared to noise.
const bareToken = (token: string) => token.toLowerCase().replace(/[.?!]+$/, "");

// Build-sentence is also what any type without a builder of its own becomes.
function buildSentenceQuestion(base, item, answer, context: QuestionContext, reversed: boolean) {
  const { pool, language, randomFn } = context;
  if (reversed && isEligibleForReversal(item, "build_sentence", language)) {
    const englishAnswer = resolveEnglishFromPrompt(item);
    const engTokens = answerTokensOf(englishAnswer);
    const engTokenSet = new Set(engTokens.map(bareToken));
    const engTokenPool = pool
      .flatMap((entry) => {
        const eng = resolveEnglishDistractorText(entry);
        return eng ? tokenizeBuildWords(eng) : [];
      })
      .filter((token) => token.length > 2 && !engTokenSet.has(token.toLowerCase()));
    const engNoise = shuffle(engTokenPool, randomFn).slice(0, 3);
    return {
      ...base,
      type: "build_sentence",
      ...reverseFields(answer, englishAnswer),
      tokens: shuffle([...engTokens, ...engNoise], randomFn)
    };
  }

  const answerTokens = answerTokensOf(answer);
  const answerSet = new Set(answerTokens.map(bareToken));
  const avgAnswerLen = answerTokens.reduce((sum, t) => sum + t.length, 0) / Math.max(1, answerTokens.length);
  const tokenPool = poolTokens(pool).filter((token) => token.length > 2 && !answerSet.has(token.toLowerCase()));
  // Prefer noise tokens whose length is close to the average answer-token length (plausible distractors)
  const scored = tokenPool.map((token) => ({
    token,
    score: Math.abs(token.length - avgAnswerLen) + randomFn()
  }));
  scored.sort((a, b) => a.score - b.score);
  const noise = scored.slice(0, 3).map((entry) => entry.token);

  return {
    ...base,
    type: "build_sentence",
    tokens: shuffle([...answerTokens, ...noise], randomFn)
  };
}

const BUILDERS = new Map<string, (...args: any[]) => any>([
  ["flashcard", flashcardQuestion],
  ["matching", matchingQuestion],
  ["pronunciation", pronunciationQuestion],
  ["mc_sentence", multipleChoiceQuestion],
  ["dialogue_turn", dialogueQuestion],
  ["roleplay", dialogueQuestion],
  ["cloze_sentence", clozeQuestion],
  ["dictation_sentence", dictationQuestion]
]);

// ─── Assembly ────────────────────────────────────────────────────────────────

// The fields every question has, whatever its type.
function baseQuestion(item, type: string, requestedType: string, answer: string, context: QuestionContext) {
  const { category, language, englishRoleplayAnswerByPrompt } = context;
  const answerEnglish = type === "roleplay"
    ? (language === "english"
      ? answer
      : String(englishRoleplayAnswerByPrompt?.get(String(item.prompt || "")) || item.answerEnglish || "").trim())
    : "";
  const base = {
    id: item.id,
    type,
    exerciseType: requestedType || type,
    level: item.level,
    prompt: item.prompt,
    answer,
    correctAnswer: answer,
    answerEnglish: answerEnglish || undefined,
    acceptedAnswers: [...buildAcceptedAnswers(answer), ...buildAuthoredAcceptedAnswers(item)],
    objective: deriveObjective(category, item.level),
    // Course items carry resolved skills (data.ts); anything added at runtime counts toward
    // its unit's generated skill.
    skills: Array.isArray(item.skills) && item.skills.length
      ? item.skills
      : [fallbackSkillId(item.category || category, resolveDifficulty(item))],
    sourceCategory: item.category || category,
    expectedMistakeTypes: getMistakeProfile(category),
    ...buildMediaFields(item)
  };
  if (!Array.isArray(base.hints) || !base.hints.length) {
    base.hints = [buildFallbackHint(category, type)];
  }
  return base;
}

function buildQuestion(item, questionType: string, context: QuestionContext, reversed: boolean) {
  const requestedType = normalizeExerciseType(item.exerciseType);
  let type = normalizeExerciseType(questionType) || requestedType || "mc_sentence";
  const answer = resolveAnswer(item);

  // Speaking long sentences is frustrating; fall back to a listening exercise.
  // Pronunciation items have no translation (the prompt IS the target sentence), so
  // build_sentence would just reveal the answer — dictation keeps it a real challenge.
  if (type === "pronunciation" && countWords(answer) > 7) {
    type = "dictation_sentence";
  }

  const base = baseQuestion(item, type, requestedType, answer, context);
  const builder = BUILDERS.get(type) || buildSentenceQuestion;
  return builder(base, item, answer, context, reversed);
}

// Questions answered by picking or arranging. A hint that names the answer gives it away
// there: "'Qui' is the subject relative pronoun." next to a gap for "qui", or a flashcard's
// back-of-card note next to the options. Flashcards and spoken items keep their hints.
const HINTS_HIDE_ANSWER = new Set(["mc_sentence", "dialogue_turn", "roleplay", "cloze_sentence", "build_sentence"]);

function createQuestion(item, questionType: string, context: QuestionContext, reversed = false) {
  const question = buildQuestion(item, questionType, context, reversed);
  if (!HINTS_HIDE_ANSWER.has(question.type) || !Array.isArray(question.hints)) return question;
  const answers = [question.answer, question.clozeAnswer, resolveAnswer(item)].filter(Boolean).join(" / ");
  const hints = hintsNotNaming(question.hints, answers);
  return { ...question, hints: hints.length ? hints : [buildFallbackHint(context.category, question.type)] };
}

module.exports = {
  createQuestion,
  buildMediaFields,
  buildAcceptedAnswers
};
