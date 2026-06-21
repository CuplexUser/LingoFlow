const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const { CATEGORIES, LEVEL_ORDER } = require("./constants.ts");

const STORIES_DIR = path.join(__dirname, "..", "..", "content", "stories");

interface StorySentence {
  target: string;
  en: string;
  break?: boolean;
}

interface StoryGlossEntry {
  g: string;
  pos: string;
  note?: string;
}

type StoryTextLang = "en" | "target";

interface StoryQuestion {
  stem: string;
  stemLang: StoryTextLang;
  options: string[];
  optionsLang: StoryTextLang;
  correct: number;
  explanation?: string;
}

interface Story {
  id: string;
  language: string;
  level: string;
  title: string;
  titleEn: string;
  theme: string;
  category: string;
  sentences: StorySentence[];
  glossary: Record<string, StoryGlossEntry>;
  culturalNote: { term: string; body: string };
  questions?: StoryQuestion[];
}

function parseJsonFile(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid JSON in ${path.basename(filePath)}: ${error instanceof Error ? error.message : "parse error"}`,
      { cause: error }
    );
  }
}

const TEXT_LANGS = ["en", "target"];

// Validates an optional comprehension question. Stories authored before quizzes
// existed simply omit `questions`, so this is only reached when the key is present.
function validateQuestion(raw: unknown, prefix: string): StoryQuestion {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${prefix} must be an object`);
  }
  const item = raw as Record<string, unknown>;

  const stem = String(item.stem || "").trim();
  if (!stem) throw new Error(`${prefix}.stem is required`);

  const stemLang = String(item.stemLang || "en").trim().toLowerCase();
  if (!TEXT_LANGS.includes(stemLang)) {
    throw new Error(`${prefix}.stemLang must be one of ${TEXT_LANGS.join(", ")}`);
  }
  const optionsLang = String(item.optionsLang || "en").trim().toLowerCase();
  if (!TEXT_LANGS.includes(optionsLang)) {
    throw new Error(`${prefix}.optionsLang must be one of ${TEXT_LANGS.join(", ")}`);
  }

  if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 5) {
    throw new Error(`${prefix}.options must be an array of 2 to 5 choices`);
  }
  const options = item.options.map((rawOption, optionIndex) => {
    const option = String(rawOption ?? "").trim();
    if (!option) throw new Error(`${prefix}.options[${optionIndex}] must be a non-empty string`);
    return option;
  });

  if (typeof item.correct !== "number" || !Number.isInteger(item.correct)) {
    throw new Error(`${prefix}.correct must be an integer`);
  }
  if (item.correct < 0 || item.correct >= options.length) {
    throw new Error(`${prefix}.correct out of range (0..${options.length - 1})`);
  }

  const question: StoryQuestion = {
    stem,
    stemLang: stemLang as StoryTextLang,
    options,
    optionsLang: optionsLang as StoryTextLang,
    correct: item.correct
  };
  if (item.explanation !== undefined) {
    if (typeof item.explanation !== "string") {
      throw new Error(`${prefix}.explanation must be a string`);
    }
    const explanation = item.explanation.trim();
    if (explanation) question.explanation = explanation;
  }
  return question;
}

// Validates and normalizes a single raw story object. `language` comes from the file name.
// Throws on the first violation so startup fails loudly, mirroring contentLoader's behavior.
function validateStory(raw: unknown, language: string, index: number): Story {
  const prefix = `stories/${language}.json[${index}]`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${prefix} must be an object`);
  }
  const item = raw as Record<string, unknown>;

  const id = String(item.id || "").trim();
  if (!id) throw new Error(`${prefix}.id is required`);

  const level = String(item.level || "").trim().toLowerCase();
  if (!LEVEL_ORDER.includes(level)) {
    throw new Error(`${prefix}.level must be one of ${LEVEL_ORDER.join(", ")}`);
  }

  const title = String(item.title || "").trim();
  if (!title) throw new Error(`${prefix}.title is required`);
  const titleEn = String(item.titleEn || "").trim();
  if (!titleEn) throw new Error(`${prefix}.titleEn is required`);
  const theme = String(item.theme || "").trim();
  if (!theme) throw new Error(`${prefix}.theme is required`);

  const category = String(item.category || "").trim();
  if (category) {
    const knownCategoryIds = CATEGORIES.map((c: { id: string }) => c.id);
    if (!knownCategoryIds.includes(category)) {
      throw new Error(`${prefix}.category "${category}" is not a known category`);
    }
  }

  if (!Array.isArray(item.sentences) || item.sentences.length === 0) {
    throw new Error(`${prefix}.sentences must be a non-empty array`);
  }
  const sentences: StorySentence[] = item.sentences.map((rawSentence, sentenceIndex) => {
    if (!rawSentence || typeof rawSentence !== "object" || Array.isArray(rawSentence)) {
      throw new Error(`${prefix}.sentences[${sentenceIndex}] must be an object`);
    }
    const sentence = rawSentence as Record<string, unknown>;
    const target = String(sentence.target ?? sentence.ru ?? "").trim();
    const en = String(sentence.en ?? "").trim();
    if (!target) throw new Error(`${prefix}.sentences[${sentenceIndex}].target is required`);
    if (!en) throw new Error(`${prefix}.sentences[${sentenceIndex}].en is required`);
    const normalized: StorySentence = { target, en };
    if (sentence.break === true) normalized.break = true;
    return normalized;
  });

  if (!item.glossary || typeof item.glossary !== "object" || Array.isArray(item.glossary)) {
    throw new Error(`${prefix}.glossary must be a plain object`);
  }
  const glossary: Record<string, StoryGlossEntry> = {};
  for (const [word, rawEntry] of Object.entries(item.glossary as Record<string, unknown>)) {
    if (!word.trim()) throw new Error(`${prefix}.glossary keys must be non-empty strings`);
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new Error(`${prefix}.glossary["${word}"] must be an object`);
    }
    const entry = rawEntry as Record<string, unknown>;
    const g = String(entry.g || "").trim();
    // pos is optional: machine-generated glossaries (LibreTranslate) may omit it,
    // while hand-authored stories supply rich part-of-speech labels.
    const pos = String(entry.pos || "").trim();
    if (!g) throw new Error(`${prefix}.glossary["${word}"].g is required`);
    const normalized: StoryGlossEntry = { g, pos };
    if (entry.note !== undefined) {
      if (typeof entry.note !== "string") {
        throw new Error(`${prefix}.glossary["${word}"].note must be a string`);
      }
      const note = entry.note.trim();
      if (note) normalized.note = note;
    }
    glossary[word.toLowerCase()] = normalized;
  }

  const note = item.culturalNote;
  if (!note || typeof note !== "object" || Array.isArray(note)) {
    throw new Error(`${prefix}.culturalNote must be an object`);
  }
  const noteTerm = String((note as Record<string, unknown>).term || "").trim();
  const noteBody = String((note as Record<string, unknown>).body || "").trim();
  if (!noteTerm) throw new Error(`${prefix}.culturalNote.term is required`);
  if (!noteBody) throw new Error(`${prefix}.culturalNote.body is required`);

  let questions: StoryQuestion[] | undefined;
  if (item.questions !== undefined) {
    if (!Array.isArray(item.questions)) {
      throw new Error(`${prefix}.questions must be an array`);
    }
    if (item.questions.length > 0) {
      questions = item.questions.map((rawQuestion, questionIndex) =>
        validateQuestion(rawQuestion, `${prefix}.questions[${questionIndex}]`)
      );
    }
  }

  const story: Story = {
    id,
    language,
    level,
    title,
    titleEn,
    theme,
    category,
    sentences,
    glossary,
    culturalNote: { term: noteTerm, body: noteBody }
  };
  if (questions) story.questions = questions;
  return story;
}

function loadStories(): Story[] {
  if (!fs.existsSync(STORIES_DIR)) return [];
  const files = fs
    .readdirSync(STORIES_DIR)
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort();

  const stories: Story[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    const language = file.replace(/\.json$/i, "").toLowerCase();
    const parsed = parseJsonFile(path.join(STORIES_DIR, file));
    if (!Array.isArray(parsed)) {
      throw new Error(`stories/${file} must be an array`);
    }
    parsed.forEach((raw, index) => {
      const story = validateStory(raw, language, index);
      if (seenIds.has(story.id)) {
        throw new Error(`stories/${file}: duplicate story id ${story.id}`);
      }
      seenIds.add(story.id);
      stories.push(story);
    });
  }

  return stories;
}

module.exports = {
  loadStories,
  validateStory
};
