// The review rubric given to whichever AI takes a work order, and the schema its result
// must match. The same zod schema defines the MCP submit_review tool and validates JSON
// pasted back by hand.
//
// Bump RUBRIC_VERSION when the rubric or schema changes, so `content_status` reports the
// reviews made under the old one as outdated.

const { z } = require("zod");

const RUBRIC_VERSION = 2;

const LIST_FIELDS = ["acceptedAnswers", "hints", "options", "clozeOptions"];
const TEXT_FIELDS = ["prompt", "correctAnswer", "culturalNote", "answerEnglish", "translation"];

const FINDING_KINDS = [
  "wrong-answer",
  "meaning-mismatch",
  "grammar-spelling",
  "unnatural",
  "missing-alternative",
  "english-only-exercise",
  "bad-hint",
  "bad-distractors",
  "cefr-mismatch",
  "cultural-note",
  "other"
];

const FixSchema = z
  .object({
    field: z.enum([...TEXT_FIELDS, ...LIST_FIELDS]),
    text: z
      .string()
      .nullable()
      .describe(`New value for ${TEXT_FIELDS.join(", ")}; null for list fields.`),
    list: z
      .array(z.string())
      .nullable()
      .describe(`New value for ${LIST_FIELDS.join(", ")}; null for text fields.`)
  })
  .strict()
  .describe("Replaces one whole field. Set both text and list to null to remove the field.");

const FindingSchema = z
  .object({
    id: z.string().describe("The item id, exactly as in the work order."),
    severity: z.enum(["error", "improvement"]),
    kind: z.enum(FINDING_KINDS),
    problem: z.string().describe("What is wrong, in one or two sentences."),
    fix: z.array(FixSchema).describe("The field changes that correct the item.")
  })
  .strict();

// The shape of a submitted review, as a raw zod shape so it can also serve as MCP tool input.
const ReviewResultShape = {
  order_id: z.string().describe("The work order id, copied from the work order."),
  reviewer: z
    .string()
    .describe("Who did the review, e.g. 'Claude Desktop (Opus 5.5)' or 'ChatGPT'."),
  summary: z
    .string()
    .describe("Two or three sentences on the overall quality of the file and its main problem."),
  findings: z.array(FindingSchema)
};
const ReviewResultSchema = z.object(ReviewResultShape).strict();

const RUBRIC = `You are reviewing the course content of LingoFlow, a language-learning app for English speakers. A work order holds one category file of one course. Find the items a fluent native speaker and experienced teacher would object to, and give a minimal fix for each.

## How items are shown to learners

Every item has an id, a CEFR level (a1-b2), a prompt, a correctAnswer and English hints. The exerciseType decides how it renders; items without one rotate through multiple choice, sentence building, cloze and dictation, so their prompt must work as a plain "translate this" task.

- Prompts such as "Say: …", "Ask: …" and "Vocabulary: …" hold the English source; correctAnswer is its translation into the course language.
- "Say aloud: …", pronunciation and dictation items show or play the target sentence itself.
- flashcard: the front shows the prompt, the back shows correctAnswer. They must differ (English on the front, target language on the back).
- mc_sentence with a prompt like "a / b / c / d": four target-language words, and the hint asks which one fits. correctAnswer must be one of the four.
- multiple_choice: a question with authored options; correctAnswer must be one of them, and the other options must be plausible but clearly wrong.
- cloze_sentence: the prompt is a target-language sentence with a ___ blank, correctAnswer fills it, and clozeOptions (when present) must contain correctAnswer.
- roleplay and dialogue_turn: the learner picks the best reply; answerEnglish is its English meaning.
- Answers, including the option a learner picks, are compared to correctAnswer exactly, ignoring case and all punctuation. So an acceptedAnswers entry that differs only in case or punctuation is redundant, and options that differ only in case or punctuation (German "ein Paar" / "ein paar") cannot be told apart. Any other translation a teacher would accept (masculine/feminine speaker, formal/informal you, common word-order variants) must be listed in acceptedAnswers, or a correct learner is marked wrong.

## What to check

1. The answer is correct, idiomatic and natural for a native speaker today, with correct spelling, diacritics and capitalization (German nouns are capitalized).
2. The answer means what the prompt says: no dropped or added meaning, the right tense, person and register.
3. Hints, culturalNote and answerEnglish are written in US English, are accurate, and are about the course language. Many courses were machine-translated from the English course, so look for leftovers that only make sense for English: hints about English spelling or hyphens, questions such as "How do you spell 50?" or "What does this English idiom mean?" answered in another language, distractors that are misspelled English words. Rewrite such an item into the equivalent exercise for the course language rather than deleting it.
4. Distractors (options, clozeOptions, the "a / b / c" words) are real words in the course language, of the same kind as the answer, and wrong.
5. The item fits its CEFR level.
6. A culturalNote, when present, is factually right and relevant.

Leave alone what is merely a matter of taste. Report only problems a teacher would correct; an item with no such problem gets no finding. Do not report the same problem twice. Review every item in the work order, not a sample.

The work order also lists automatic lint findings for the file. Confirm or dismiss them: report the real ones with a fix, and say nothing about false alarms.

## Fixes

The result is linted with your fixes applied, and a fix that introduces a mechanical defect is rejected with the reason; correct it and submit again. A fix replaces whole fields of the item. Use "text" for ${TEXT_FIELDS.join(", ")}, and "list" for ${LIST_FIELDS.join(", ")}; set the unused one to null. Set both to null to remove a field. When you change correctAnswer, keep options or clozeOptions consistent with it. Never change id, level or exerciseType. Keep fixes minimal: correct the item, don't restyle it.

Severity "error" is for content that teaches something wrong or cannot be answered correctly. Severity "improvement" is for content that works but is unnatural, unhelpful or missing an accepted alternative.

The Russian course is the most carefully edited one. Reference items from it are included to show the expected standard of hints, accepted answers and naturalness, not as content to copy.`;

module.exports = {
  RUBRIC,
  RUBRIC_VERSION,
  LIST_FIELDS,
  TEXT_FIELDS,
  ReviewResultShape,
  ReviewResultSchema
};
