// Content lint: mechanical quality checks over server/content/languages.
//
// Findings come in two severities:
//   - "error": a definite defect (an untranslated answer, a cloze whose options lack the answer).
//     The content_lint test fails on any error, so these cannot regress.
//   - "warning": a heuristic signal (an answer that reads like English, a generic hint) that
//     needs a human or LLM look. Reported by `npm run lint:content`, never fails the build.
const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const { CATEGORIES } = require("./constants.ts");
const { CONTENT_DIR } = require("../paths.ts");

type Severity = "error" | "warning";

type ContentItem = {
  id?: string;
  level?: string;
  prompt?: string;
  correctAnswer?: string;
  target?: string;
  hints?: unknown;
  exerciseType?: string;
  options?: unknown;
  clozeOptions?: unknown;
  acceptedAnswers?: unknown;
  answerEnglish?: string;
  translation?: string;
  culturalNote?: string;
  [key: string]: unknown;
};

type LintFinding = {
  language: string;
  category: string;
  id: string;
  rule: string;
  severity: Severity;
  message: string;
};

const RULES: Record<string, { severity: Severity; description: string }> = {
  "untranslated-answer": {
    severity: "error",
    description: "The answer is the English prompt or the English course's answer, word for word."
  },
  "prompt-is-answer": {
    severity: "error",
    description: "The prompt is the answer itself (a flashcard with the same text on both sides)."
  },
  "options-missing-answer": {
    severity: "error",
    description: "Authored `options` do not contain `correctAnswer`."
  },
  "cloze-options-missing-answer": {
    severity: "error",
    description:
      "Authored `clozeOptions` do not contain `correctAnswer`, so nothing on screen is correct."
  },
  "digits-for-spelled-number": {
    severity: "error",
    description: "The prompt asks for a number in words, but the answer is written in digits."
  },
  "duplicate-options": {
    severity: "error",
    description: "Two options are the same text (ignoring case and punctuation)."
  },
  "slash-prompt-missing-answer": {
    severity: "error",
    description: "A word-choice prompt (`a / b / c`) does not list the answer among its choices."
  },
  "placeholder-text": {
    severity: "error",
    description:
      "An answer or English field still holds a blank (`___`), `TODO`, or an empty string."
  },
  "invalid-accepted-answers": {
    severity: "error",
    description: "`acceptedAnswers` is not a list of non-empty strings, or repeats the main answer."
  },
  "british-spelling": {
    severity: "error",
    description: "A learner-facing English field uses British spelling (the app uses US English)."
  },
  "same-as-english-word": {
    severity: "warning",
    description:
      "A single-word answer equals the English word. Usually a cognate, sometimes untranslated."
  },
  "answer-looks-english": {
    severity: "warning",
    description: "A multi-word answer reads like English rather than the target language."
  },
  "answer-wrong-language": {
    severity: "warning",
    description: "A multi-word answer reads like a different course language."
  },
  "answer-wrong-script": {
    severity: "warning",
    description: "A Russian answer contains no Cyrillic."
  },
  "english-field-not-english": {
    severity: "warning",
    description:
      "A hint, cultural note, `answerEnglish` or `translation` reads like the target language."
  },
  "missing-answer-english": {
    severity: "warning",
    description:
      "A roleplay item has no `answerEnglish` and no English course item to borrow one from."
  },
  "about-english": {
    severity: "warning",
    description:
      "A prompt or hint in another course talks about English, a sign it was copied from the English course."
  },
  "generic-hint": {
    severity: "warning",
    description: "The only hint is a stock placeholder that teaches nothing."
  },
  "hint-reveals-answer": {
    severity: "warning",
    description: "A hint contains the full multi-word answer."
  }
};

// Common function words per course language, used to guess which language a sentence is in.
// A word listed under several languages counts fractionally toward each.
const STOPWORDS: Record<string, string[]> = {
  english: [
    "the",
    "and",
    "is",
    "are",
    "was",
    "were",
    "of",
    "to",
    "with",
    "you",
    "your",
    "my",
    "this",
    "that",
    "it",
    "have",
    "has",
    "for",
    "not",
    "do",
    "does",
    "what",
    "where",
    "how",
    "we",
    "they",
    "be",
    "will",
    "would",
    "can",
    "at",
    "on",
    "from",
    "by",
    "an",
    "i",
    "me",
    "our",
    "which",
    "there",
    "been",
    "about",
    "should",
    "could",
    "very",
    "but",
    "use",
    "means",
    "if",
    "when",
    "or",
    "as",
    "word",
    "literally"
  ],
  spanish: [
    "el",
    "la",
    "los",
    "las",
    "de",
    "que",
    "y",
    "en",
    "un",
    "una",
    "es",
    "por",
    "con",
    "para",
    "no",
    "se",
    "su",
    "mi",
    "muy",
    "pero",
    "está",
    "estoy",
    "soy",
    "del",
    "al",
    "lo",
    "como",
    "más",
    "yo",
    "tú",
    "usted",
    "hay",
    "este",
    "esta",
    "es",
    "mis",
    "sus",
    "nos",
    "le"
  ],
  italian: [
    "il",
    "lo",
    "la",
    "gli",
    "le",
    "di",
    "che",
    "e",
    "è",
    "un",
    "una",
    "per",
    "con",
    "non",
    "sono",
    "sei",
    "mi",
    "ti",
    "del",
    "della",
    "molto",
    "ma",
    "ho",
    "hai",
    "ci",
    "questo",
    "questa",
    "io",
    "come",
    "più",
    "anche",
    "sempre",
    "nel",
    "nella",
    "alla",
    "dei",
    "sulla",
    "mia",
    "mio",
    "qui",
    "ha",
    "dell",
    "dopo",
    "prima",
    "abbiamo",
    "posso",
    "puoi",
    "vorrei",
    "avrei",
    "avessi",
    "siamo",
    "gli",
    "dello",
    "degli",
    "perché",
    "quando",
    "però"
  ],
  french: [
    "le",
    "la",
    "les",
    "de",
    "des",
    "du",
    "et",
    "est",
    "un",
    "une",
    "je",
    "tu",
    "il",
    "nous",
    "vous",
    "pas",
    "ne",
    "que",
    "qui",
    "pour",
    "avec",
    "dans",
    "sur",
    "au",
    "aux",
    "ce",
    "cette",
    "mon",
    "ma",
    "très",
    "mais",
    "suis",
    "ai",
    "c",
    "j",
    "l",
    "d",
    "n",
    "qu"
  ],
  german: [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "ich",
    "du",
    "nicht",
    "ein",
    "eine",
    "zu",
    "mit",
    "den",
    "dem",
    "sie",
    "wir",
    "ihr",
    "es",
    "auf",
    "für",
    "von",
    "sehr",
    "aber",
    "bin",
    "habe",
    "auch",
    "wie",
    "was",
    "wo",
    "im",
    "kann",
    "mein",
    "meine",
    "haben",
    "sind"
  ],
  swedish: [
    "och",
    "är",
    "att",
    "det",
    "en",
    "ett",
    "jag",
    "du",
    "inte",
    "på",
    "med",
    "för",
    "som",
    "har",
    "vi",
    "de",
    "till",
    "av",
    "den",
    "om",
    "men",
    "mycket",
    "kan",
    "var",
    "vad",
    "här",
    "min",
    "mitt",
    "i",
    "vill",
    "ska",
    "jag",
    "hur"
  ]
};

const STOPWORD_WEIGHTS: Map<string, Map<string, number>> = (() => {
  const owners = new Map<string, Set<string>>();
  for (const [language, words] of Object.entries(STOPWORDS)) {
    for (const word of words) {
      if (!owners.has(word)) owners.set(word, new Set());
      owners.get(word)!.add(language);
    }
  }
  const weights = new Map<string, Map<string, number>>();
  for (const [word, languages] of owners) {
    weights.set(word, new Map([...languages].map((language) => [language, 1 / languages.size])));
  }
  return weights;
})();

// British spellings that have turned up in learner-facing English, mapped to the US form.
// Matched as whole words, case-insensitively.
const BRITISH_SPELLINGS: Record<string, string> = {
  colour: "color",
  colours: "colors",
  coloured: "colored",
  colourful: "colorful",
  favourite: "favorite",
  favourites: "favorites",
  favour: "favor",
  favours: "favors",
  centre: "center",
  centres: "centers",
  centred: "centered",
  theatre: "theater",
  theatres: "theaters",
  metre: "meter",
  metres: "meters",
  litre: "liter",
  litres: "liters",
  kilometre: "kilometer",
  kilometres: "kilometers",
  fibre: "fiber",
  honour: "honor",
  honours: "honors",
  honoured: "honored",
  behaviour: "behavior",
  behaviours: "behaviors",
  neighbour: "neighbor",
  neighbours: "neighbors",
  neighbourhood: "neighborhood",
  humour: "humor",
  labour: "labor",
  flavour: "flavor",
  flavours: "flavors",
  harbour: "harbor",
  rumour: "rumor",
  savoury: "savory",
  organise: "organize",
  organised: "organized",
  organising: "organizing",
  organisation: "organization",
  organisations: "organizations",
  recognise: "recognize",
  recognised: "recognized",
  realise: "realize",
  realised: "realized",
  apologise: "apologize",
  apologised: "apologized",
  specialise: "specialize",
  specialised: "specialized",
  emphasise: "emphasize",
  summarise: "summarize",
  memorise: "memorize",
  criticise: "criticize",
  analyse: "analyze",
  analysed: "analyzed",
  practise: "practice",
  practised: "practiced",
  practising: "practicing",
  travelled: "traveled",
  travelling: "traveling",
  traveller: "traveler",
  travellers: "travelers",
  cancelled: "canceled",
  cancelling: "canceling",
  jewellery: "jewelry",
  programme: "program",
  programmes: "programs",
  catalogue: "catalog",
  defence: "defense",
  offence: "offense",
  licence: "license",
  grey: "gray",
  cheque: "check",
  cheques: "checks",
  artefact: "artifact",
  artefacts: "artifacts",
  mould: "mold",
  plough: "plow",
  tyre: "tire",
  tyres: "tires",
  aluminium: "aluminum",
  judgement: "judgment",
  enrol: "enroll",
  fulfil: "fulfill",
  modelling: "modeling",
  labelled: "labeled",
  pyjamas: "pajamas",
  moustache: "mustache",
  sceptical: "skeptical",
  manoeuvre: "maneuver",
  paediatrician: "pediatrician",
  oesophagus: "esophagus",
  anaemia: "anemia",
  haemoglobin: "hemoglobin",
  foetus: "fetus",
  oestrogen: "estrogen",
  diarrhoea: "diarrhea",
  orthopaedic: "orthopedic",
  encyclopaedia: "encyclopedia",
  mum: "mom"
};

const READ_ALOUD_PROMPT_RE = /^(say aloud|say this sentence|read this [a-z]+ aloud)\s*:/i;

const STOCK_HINTS = [/^practice this phrase out loud\.?$/i, /^match the cultural term\.?$/i];

const EXERCISE_PREFIX_RE = /^[a-zA-Z][a-zA-Z\s.,?!()]{1,60}:\s*/;

function stripExercisePrefix(text: string): string {
  return String(text || "")
    .replace(EXERCISE_PREFIX_RE, "")
    .replace(/^["'«»]|["'«»]$/g, "")
    .trim();
}

function normalize(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

function languageScores(text: string): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const language of Object.keys(STOPWORDS)) scores[language] = 0;
  for (const token of tokenize(text)) {
    const weights = STOPWORD_WEIGHTS.get(token);
    if (!weights) continue;
    for (const [language, weight] of weights) scores[language] += weight;
  }
  return scores;
}

// The most likely course language for `text`, or "" when there is too little signal.
function detectLanguage(text: string): string {
  if (/\p{Script=Cyrillic}/u.test(text) && cyrillicShare(text) > 0.5) return "russian";
  const scores = languageScores(text);
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = ranked;
  if (best[1] < 1.5 || best[1] - runnerUp[1] < 1) return "";
  return best[0];
}

function cyrillicShare(text: string): number {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  if (!letters.length) return 0;
  return letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter)).length / letters.length;
}

function resolveAnswer(item: ContentItem): string {
  return String(item.target || item.correctAnswer || "").trim();
}

function hintsOf(item: ContentItem): string[] {
  return Array.isArray(item.hints) ? item.hints.map((hint) => String(hint ?? "")) : [];
}

function isMultipleChoiceQuestion(item: ContentItem): boolean {
  // Comprehension questions ("What is a матрёшка?") have English answers by design.
  return String(item.exerciseType || "").toLowerCase() === "multiple_choice";
}

function isRoleplay(item: ContentItem): boolean {
  const type = String(item.exerciseType || "").toLowerCase();
  return type === "roleplay";
}

function loadLanguageItems(language: string): Record<string, ContentItem[]> {
  const byCategory: Record<string, ContentItem[]> = {};
  for (const { id: category } of CATEGORIES) {
    const filePath = path.join(CONTENT_DIR, language, `${category}.json`);
    byCategory[category] = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf8"))
      : [];
  }
  return byCategory;
}

function listLanguages(): string[] {
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((entry: string) => fs.statSync(path.join(CONTENT_DIR, entry)).isDirectory())
    .sort();
}

function lintItem(
  item: ContentItem,
  language: string,
  category: string,
  englishByPrompt: Map<string, ContentItem>
): LintFinding[] {
  const findings: LintFinding[] = [];
  const id = String(item.id || "(no id)");
  const report = (rule: string, message: string) => {
    findings.push({ language, category, id, rule, severity: RULES[rule].severity, message });
  };

  const answer = resolveAnswer(item);
  const prompt = String(item.prompt || "");
  const hints = hintsOf(item);
  const type = String(item.exerciseType || "").toLowerCase();
  const isEnglishCourse = language === "english";

  // Placeholders in the answer and in fields learners read.
  if (/_{2,}|\bTODO\b/.test(answer)) report("placeholder-text", `correctAnswer is "${answer}"`);
  for (const field of ["answerEnglish", "translation", "culturalNote"] as const) {
    if (item[field] !== undefined && !String(item[field]).trim()) {
      report("placeholder-text", `${field} is empty`);
    }
  }
  if (hints.some((hint) => !hint.trim())) report("placeholder-text", "a hint is empty");

  // Untranslated answers, and prompts that already show the answer.
  if (!isEnglishCourse && !isMultipleChoiceQuestion(item)) {
    const normalizedAnswer = normalize(answer);
    const isSingleWord = normalizedAnswer.split(" ").length === 1;
    const englishItem = englishByPrompt.get(prompt);
    const matchesEnglishAnswer =
      englishItem && normalize(resolveAnswer(englishItem)) === normalizedAnswer;
    const matchesPrompt = normalize(stripExercisePrefix(prompt)) === normalizedAnswer;
    // "Say aloud: У меня болит голова." shows the target sentence on purpose.
    const isReadAloud = type === "pronunciation" || READ_ALOUD_PROMPT_RE.test(prompt);
    const answerIsEnglish =
      language === "russian"
        ? !/\p{Script=Cyrillic}/u.test(answer)
        : detectLanguage(answer) === "english";

    if (normalizedAnswer && (matchesEnglishAnswer || (matchesPrompt && !isReadAloud))) {
      if (isSingleWord) {
        report("same-as-english-word", `correctAnswer "${answer}" equals the English word`);
      } else if (matchesEnglishAnswer || answerIsEnglish) {
        report("untranslated-answer", `correctAnswer "${answer}" is the English text`);
      } else {
        report("prompt-is-answer", `prompt "${prompt}" already shows the answer`);
      }
    }
  }

  // Answer language.
  if (!isEnglishCourse && !isMultipleChoiceQuestion(item) && tokenize(answer).length >= 4) {
    if (language === "russian") {
      if (!/\p{Script=Cyrillic}/u.test(answer)) {
        report("answer-wrong-script", `correctAnswer "${answer}" has no Cyrillic`);
      }
    } else {
      const detected = detectLanguage(answer);
      if (detected === "english") {
        report("answer-looks-english", `correctAnswer "${answer}" reads like English`);
      } else if (detected && detected !== language && languageScores(answer)[language] < 1) {
        // Romance languages share many function words, so only report a sentence with almost
        // no sign of the expected language.
        report("answer-wrong-language", `correctAnswer "${answer}" reads like ${detected}`);
      }
    }
  }

  // Authored options.
  const checkOptions = (field: "options" | "clozeOptions", missingRule: string) => {
    const raw = item[field];
    if (raw === undefined) return;
    const options = Array.isArray(raw) ? raw.map((option) => String(option ?? "")) : [];
    if (!options.some((option) => option.trim() === answer)) {
      report(missingRule, `${field} ${JSON.stringify(options)} lack "${answer}"`);
    }
    const seen = new Set<string>();
    for (const option of options) {
      // Keep hyphens and spaces: "тридцать семь" vs "тридцать-семь" is the point of the question.
      const key = option
        .trim()
        .toLowerCase()
        .replace(/[.!?]+$/, "");
      if (seen.has(key)) report("duplicate-options", `${field} repeat "${option}"`);
      seen.add(key);
    }
  };
  checkOptions("options", "options-missing-answer");
  checkOptions("clozeOptions", "cloze-options-missing-answer");

  if (/\b(spell|in words)\b/i.test(prompt) && /\d/.test(answer)) {
    report("digits-for-spelled-number", `"${prompt}" is answered with "${answer}"`);
  }

  // Word-choice prompts: "коллега / сосед / незнакомец / друг".
  if (type === "mc_sentence" && item.options === undefined && prompt.includes(" / ")) {
    const choices = prompt.split(" / ").map(normalize);
    if (choices.length >= 3 && !choices.includes(normalize(answer))) {
      report("slash-prompt-missing-answer", `"${answer}" is not one of "${prompt}"`);
    }
  }

  // acceptedAnswers.
  if (item.acceptedAnswers !== undefined) {
    const accepted = item.acceptedAnswers;
    if (
      !Array.isArray(accepted) ||
      accepted.some((value) => typeof value !== "string" || !value.trim())
    ) {
      report("invalid-accepted-answers", "acceptedAnswers must be non-empty strings");
    } else if (accepted.some((value) => normalize(value) === normalize(answer))) {
      report("invalid-accepted-answers", "acceptedAnswers repeats correctAnswer");
    }
  }

  // Fields that must be in (US) English. For the English course the answer is English too.
  const englishFields: Array<[string, string]> = [
    ...hints.map((hint, index): [string, string] => [`hints[${index}]`, hint]),
    ["culturalNote", String(item.culturalNote || "")],
    ["answerEnglish", String(item.answerEnglish || "")],
    ["translation", String(item.translation || "")]
  ];
  // Prompts are checked for spelling only: many hold target-language text by design
  // ("Say aloud: …", "Complete: … ___ …").
  englishFields.push(["prompt", prompt]);
  if (isEnglishCourse) englishFields.push(["correctAnswer", answer]);

  for (const [field, text] of englishFields) {
    if (!text) continue;
    // A hint may quote target-language words ("'Рад' is the short form…"), so look only at the
    // text outside quotes before deciding the field is in the wrong language or spelling.
    const unquoted = text.replace(/'[^']*'|"[^"]*"|«[^»]*»|‘[^’]*’|“[^”]*”/g, " ");
    for (const word of tokenize(unquoted)) {
      if (BRITISH_SPELLINGS[word]) {
        report("british-spelling", `${field}: "${word}" → "${BRITISH_SPELLINGS[word]}"`);
      }
    }
    const isLanguageChecked =
      !isEnglishCourse &&
      field !== "prompt" &&
      field !== "correctAnswer" &&
      // Pronunciation hints list stressed target words: "Stress: веснОй, прирОда".
      !/^stress\s*:/i.test(text) &&
      tokenize(unquoted).length >= 4;
    if (isLanguageChecked) {
      const detected =
        language === "russian"
          ? cyrillicShare(unquoted) > 0.7
            ? "russian"
            : ""
          : detectLanguage(unquoted);
      if (detected === language) {
        report("english-field-not-english", `${field} reads like ${language}: "${text}"`);
      }
    }
  }

  if (!isEnglishCourse) {
    const aboutEnglish =
      /\b(in|formal|spoken|natural|british|american) english\b|\benglish (has|uses|says|idiom)/i;
    const field = [
      ["prompt", prompt],
      ...hints.map((hint, index) => [`hints[${index}]`, hint])
    ].find(([, text]) => aboutEnglish.test(text));
    if (field) report("about-english", `${field[0]}: "${field[1]}"`);
  }

  // Roleplay items need an English rendering of the answer for the feedback screen.
  if (!isEnglishCourse && isRoleplay(item) && !String(item.answerEnglish || "").trim()) {
    const englishItem = englishByPrompt.get(prompt);
    if (!englishItem || String(englishItem.exerciseType || "").toLowerCase() !== "roleplay") {
      report("missing-answer-english", "roleplay item has no answerEnglish");
    }
  }

  // Hints.
  if (
    hints.length &&
    hints.every((hint) => STOCK_HINTS.some((pattern) => pattern.test(hint.trim())))
  ) {
    report("generic-hint", `only hint is "${hints[0]}"`);
  }
  if (tokenize(answer).length >= 2) {
    const normalizedAnswer = normalize(answer);
    if (hints.some((hint) => normalize(hint).includes(normalizedAnswer))) {
      report("hint-reveals-answer", "a hint contains the full answer");
    }
  }

  return findings;
}

// Lint every language (or just `languages`) and return all findings.
function lintContent(languages: string[] = listLanguages()): LintFinding[] {
  const english = loadLanguageItems("english");
  const findings: LintFinding[] = [];
  for (const language of languages) {
    const byCategory = loadLanguageItems(language);
    for (const [category, items] of Object.entries(byCategory)) {
      const englishByPrompt = new Map(
        (english[category] || []).map((item) => [String(item.prompt || ""), item])
      );
      for (const item of items) {
        findings.push(...lintItem(item, language, category, englishByPrompt));
      }
    }
  }
  return findings;
}

// Per-language depth figures, for comparing a course against the most curated one.
function contentDepth(languages: string[] = listLanguages()) {
  return languages.map((language) => {
    const items = Object.values(loadLanguageItems(language)).flat();
    const hints = items.flatMap(hintsOf).map((hint) => hint.trim());
    const levels: Record<string, number> = {};
    for (const item of items) levels[String(item.level)] = (levels[String(item.level)] || 0) + 1;
    return {
      language,
      items: items.length,
      levels,
      culturalNotes: items.filter((item) => String(item.culturalNote || "").trim()).length,
      acceptedAnswers: items.filter(
        (item) => Array.isArray(item.acceptedAnswers) && item.acceptedAnswers.length
      ).length,
      authoredDistractors: items.filter((item) => item.options || item.clozeOptions).length,
      distinctHintRatio: hints.length ? new Set(hints).size / hints.length : 0
    };
  });
}

// Errors that predate the check, keyed by baselineKey(). The content_lint test lets this
// list shrink but never grow.
const BASELINE_PATH = path.join(CONTENT_DIR, "..", "lint-baseline.json");

function baselineKey(finding: LintFinding): string {
  return `${finding.language}/${finding.id}/${finding.rule}`;
}

function loadBaseline(): string[] {
  return fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : [];
}

module.exports = {
  RULES,
  lintContent,
  contentDepth,
  detectLanguage,
  listLanguages,
  baselineKey,
  loadBaseline,
  BASELINE_PATH
};
