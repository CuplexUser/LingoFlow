import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCourseSelectors, createSessionGenerator } = require("../data/sessionGenerator.ts");

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseItem {
  id: string;
  level: string;
  difficulty: string;
  prompt: string;
  correctAnswer: string;
  exerciseType: string;
}

interface CourseContent {
  [language: string]: {
    [category: string]: ExerciseItem[];
  };
}

interface MatchingPair {
  id?: string;
  prompt: string;
  answer?: string;
}

// ─── Distractor quality ───────────────────────────────────────────────────────

test("matching questions do not include roleplay prompts as distractors", () => {
  const course: CourseContent = {
    english: {
      culture_history: [
        { id: "match-item", level: "a1", difficulty: "a1", prompt: "a tradition", correctAnswer: "a tradition", exerciseType: "matching" },
        { id: "roleplay-item", level: "b1", difficulty: "b1", prompt: "Choose the best response. Who built this castle?", correctAnswer: "It was built by a king.", exerciseType: "roleplay" },
        { id: "flashcard-item", level: "a1", difficulty: "a1", prompt: "a museum ticket", correctAnswer: "a museum ticket", exerciseType: "flashcard" },
        { id: "build-item", level: "a1", difficulty: "a1", prompt: "Say: This statue is famous.", correctAnswer: "This statue is famous.", exerciseType: "build_sentence" }
      ]
    }
  };

  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  const session = generateSession({ language: "english", category: "culture_history", count: 4, random: () => 0 });

  const matchingQuestion = session.questions.find((q: any) => q.type === "matching");
  assert.ok(matchingQuestion, "expected a matching question");

  const pairs: MatchingPair[] = Array.isArray(matchingQuestion.pairs) ? matchingQuestion.pairs : [];
  assert.equal(
    pairs.some((p) => p.id === "roleplay-item"),
    false,
    "roleplay items should not be included in matching pairs"
  );
  assert.equal(
    pairs.some((p) => /who built this castle\?/i.test(String(p.prompt || ""))),
    false,
    "roleplay prompts should not appear in matching UI"
  );
});

test("multiple choice sentence options avoid single-word distractors", () => {
  const course: CourseContent = {
    english: {
      news_media: [
        { id: "news-main", level: "a2", difficulty: "a2", prompt: "I read the news every morning.", correctAnswer: "I read the news every morning.", exerciseType: "multiple_choice" },
        { id: "news-sentence-1", level: "a2", difficulty: "a2", prompt: "The reporter interviewed several witnesses.", correctAnswer: "The reporter interviewed several witnesses.", exerciseType: "multiple_choice" },
        { id: "news-sentence-2", level: "a2", difficulty: "a2", prompt: "We watched the evening bulletin together.", correctAnswer: "We watched the evening bulletin together.", exerciseType: "multiple_choice" },
        { id: "news-word-1", level: "a2", difficulty: "a2", prompt: "Headline", correctAnswer: "Headline", exerciseType: "multiple_choice" },
        { id: "news-word-2", level: "a2", difficulty: "a2", prompt: "Broadcast", correctAnswer: "Broadcast", exerciseType: "multiple_choice" }
      ]
    }
  };

  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  const session = generateSession({ language: "english", category: "news_media", count: 5, random: () => 0 });

  const mcQuestion = session.questions.find((q: any) => q.id === "news-main");
  assert.ok(mcQuestion, "expected a multiple-choice question");
  assert.equal(mcQuestion.type, "mc_sentence");
  assert.ok(Array.isArray(mcQuestion.options));

  const distractors: string[] = mcQuestion.options.filter((opt: string) => opt !== "I read the news every morning.");
  assert.ok(distractors.length > 0, "expected at least one distractor");
  assert.equal(
    distractors.some((opt) => opt.trim().split(/\s+/g).filter(Boolean).length < 3),
    false,
    "sentence-style prompts should not receive single-word distractors"
  );
});

// ─── Token generation ─────────────────────────────────────────────────────────

test("build sentence tokens strip wrapping guillemets and punctuation", () => {
  const course: CourseContent = {
    russian: {
      science_technology: [
        { id: "ru-build-main", level: "a2", difficulty: "a2", prompt: "Build the sentence.", correctAnswer: "Я изучаю «науки и технологии».", exerciseType: "build_sentence" },
        { id: "ru-build-noise", level: "a2", difficulty: "a2", prompt: "Say: Это интересный курс.", correctAnswer: "Это интересный курс.", exerciseType: "build_sentence" }
      ]
    }
  };

  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  // Use 0.5 so reversed check (< 0.35) is false — this test targets forward build_sentence token stripping.
  const session = generateSession({ language: "russian", category: "science_technology", count: 2, random: () => 0.5 });

  const buildQuestion = session.questions.find((q: any) => q.id === "ru-build-main");
  assert.ok(buildQuestion, "expected a build sentence question");
  assert.equal(buildQuestion.type, "build_sentence");
  assert.ok(Array.isArray(buildQuestion.tokens));

  // Guillemets must be stripped from all tokens
  const tokens: string[] = buildQuestion.tokens;
  assert.equal(
    tokens.some((t) => t.startsWith("«") || t.endsWith("»")),
    false,
    "build tokens should not keep wrapping guillemet markers"
  );

  // Sentence-ending punctuation is preserved on the last answer word only (one token max)
  const trailingPunctTokens = tokens.filter((t) => /[.?!]$/.test(t));
  assert.ok(trailingPunctTokens.length <= 1, "at most one token may carry trailing sentence punctuation");
  assert.ok(tokens.includes("науки"), "expected cleaned core token for quoted word");
});

// ─── Reversed exercises (translate to English) ────────────────────────────────

// Minimal Spanish pool used across reversal tests.
// random: () => 0  → forces all eligible items to reversed (0 < 0.35)
// and makes shuffles deterministic.
const SPANISH_POOL_REVERSAL = [
  { id: "sp-1", level: "a1", difficulty: "a1", prompt: "Say: Hello, how are you?", correctAnswer: "Hola, ¿cómo estás?" },
  { id: "sp-2", level: "a1", difficulty: "a1", prompt: "Say: Thank you very much.", correctAnswer: "Muchas gracias." },
  { id: "sp-3", level: "a1", difficulty: "a1", prompt: "Say: Where is the bathroom?", correctAnswer: "¿Dónde está el baño?" },
  { id: "sp-4", level: "a2", difficulty: "a2", prompt: "Say: I would like a window seat.", correctAnswer: "Me gustaría un asiento junto a la ventana." },
  { id: "sp-5", level: "a2", difficulty: "a2", prompt: "Say: Can you help me please?", correctAnswer: "¿Me puede ayudar, por favor?" },
  { id: "sp-6", level: "a2", difficulty: "a2", prompt: "Say: What time does it open?", correctAnswer: "¿A qué hora abre?" }
];

function makeSpanishCourse() {
  const course = { spanish: { travel: SPANISH_POOL_REVERSAL } };
  const selectors = createCourseSelectors(course);
  return createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
}

test("reversed mc_sentence has direction, sourceText, and English answer", () => {
  const generateSession = makeSpanishCourse();
  const session = generateSession({
    language: "spanish",
    category: "travel",
    count: 6,
    random: () => 0
  });

  const reversed = session.questions.filter((q: any) => q.direction === "reverse" && q.type === "mc_sentence");
  assert.ok(reversed.length > 0, "expected at least one reversed mc_sentence");

  for (const q of reversed) {
    // sourceText must be the Spanish phrase (contains non-ASCII or is clearly Spanish)
    assert.ok(typeof q.sourceText === "string" && q.sourceText.length > 0, "sourceText must be set");
    // answer must be the English phrase
    assert.ok(typeof q.answer === "string" && q.answer.length > 0, "answer must be set");
    // answer should not contain Spanish characters unique to the target pool
    assert.equal(
      q.sourceText,
      SPANISH_POOL_REVERSAL.find((item) => item.correctAnswer === q.sourceText)?.correctAnswer,
      "sourceText should match a correctAnswer from the pool"
    );
    // options must be an array with at least 2 items (correct + distractors)
    assert.ok(Array.isArray(q.options) && q.options.length >= 2, "reversed mc_sentence must have options");
    // No option should still carry an exercise prefix
    for (const opt of q.options) {
      assert.ok(
        !/^(say|choose the (best|correct)|translate|flashcard|vocabulary|ask|fill in|build)[\s:]/i.test(opt),
        `option "${opt}" still carries an exercise prefix`
      );
    }
    // prompt must be the normalized label
    assert.equal(q.prompt, "Translate to English");
  }
});

test("reversed build_sentence has English tokens matching the English phrase", () => {
  const generateSession = makeSpanishCourse();
  const session = generateSession({
    language: "spanish",
    category: "travel",
    count: 6,
    random: () => 0
  });

  const reversed = session.questions.filter((q: any) => q.direction === "reverse" && q.type === "build_sentence");
  assert.ok(reversed.length > 0, "expected at least one reversed build_sentence");

  for (const q of reversed) {
    assert.ok(typeof q.sourceText === "string" && q.sourceText.length > 0, "sourceText must be set");
    assert.ok(Array.isArray(q.tokens) && q.tokens.length > 0, "tokens must be set");
    // Every word from the English answer must appear somewhere in the token set
    const answerWords = String(q.answer || "").toLowerCase().split(/\s+/).filter(Boolean);
    const tokenWords = (q.tokens as string[]).map((t: string) => t.toLowerCase().replace(/[.?!]+$/, ""));
    for (const word of answerWords) {
      assert.ok(
        tokenWords.some((t) => t === word.replace(/[.?!]+$/, "")),
        `answer word "${word}" should appear in token set`
      );
    }
    assert.equal(q.prompt, "Translate to English");
  }
});

test("English-language sessions never produce reversed questions", () => {
  const course = {
    english: {
      essentials: [
        { id: "en-1", level: "a1", difficulty: "a1", prompt: "Say: Hello.", correctAnswer: "Hello." },
        { id: "en-2", level: "a1", difficulty: "a1", prompt: "Say: Thank you.", correctAnswer: "Thank you." },
        { id: "en-3", level: "a1", difficulty: "a1", prompt: "Say: Good morning.", correctAnswer: "Good morning." },
        { id: "en-4", level: "a2", difficulty: "a2", prompt: "Say: See you later.", correctAnswer: "See you later." }
      ]
    }
  };
  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  const session = generateSession({ language: "english", category: "essentials", count: 4, random: () => 0 });

  const anyReversed = session.questions.some((q: any) => q.direction === "reverse");
  assert.equal(anyReversed, false, "English sessions must never produce reversed questions");
});

test("distractor options for reversed mc_sentence strip instruction prefixes", () => {
  const course = {
    russian: {
      travel: [
        { id: "ru-1", level: "a1", difficulty: "a1", prompt: "Say: I would like a window seat.", correctAnswer: "Я хотел бы место у окна." },
        { id: "ru-2", level: "a1", difficulty: "a1", prompt: "Choose the correct translation: I want to check in.", correctAnswer: "Я хочу зарегистрироваться." },
        { id: "ru-3", level: "a2", difficulty: "a2", prompt: "Say: Where is the nearest metro station?", correctAnswer: "Где ближайшая станция метро?" },
        { id: "ru-4", level: "a2", difficulty: "a2", prompt: "Say: Can you call a taxi for me?", correctAnswer: "Вы можете вызвать такси?" },
        { id: "ru-5", level: "a1", difficulty: "a1", prompt: "Say: How much does this cost?", correctAnswer: "Сколько это стоит?" }
      ]
    }
  };
  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  const session = generateSession({ language: "russian", category: "travel", count: 5, random: () => 0 });

  const reversed = session.questions.filter((q: any) => q.direction === "reverse" && q.type === "mc_sentence");
  assert.ok(reversed.length > 0, "expected at least one reversed mc_sentence");

  for (const q of reversed) {
    for (const opt of (q.options as string[])) {
      // The bug: "Choose the correct translation: I want to check in." should not appear as an option
      assert.ok(
        !/^choose the correct translation:/i.test(opt),
        `option should not contain instruction prefix: "${opt}"`
      );
      assert.ok(
        !/^(say|choose|translate|flashcard|vocabulary|ask|fill in|build)[\s:]/i.test(opt),
        `option "${opt}" still carries an exercise prefix after stripping`
      );
    }
  }
});

test("items with Cyrillic/non-Latin prompts are not used as English distractors", () => {
  const course = {
    russian: {
      travel: [
        { id: "ru-main", level: "a1", difficulty: "a1", prompt: "Say: I need a hotel room.", correctAnswer: "Мне нужен номер в отеле." },
        // Prompt that looks like an instruction prefix but has Cyrillic content — should not become a distractor
        { id: "ru-cyrillic", level: "a1", difficulty: "a1", prompt: "Скажите: I need help.", correctAnswer: "Мне нужна помощь." },
        { id: "ru-3", level: "a1", difficulty: "a1", prompt: "Say: Where is the exit?", correctAnswer: "Где выход?" },
        { id: "ru-4", level: "a1", difficulty: "a1", prompt: "Say: How much is the ticket?", correctAnswer: "Сколько стоит билет?" },
        { id: "ru-5", level: "a2", difficulty: "a2", prompt: "Say: Can you help me find the platform?", correctAnswer: "Вы можете помочь найти платформу?" }
      ]
    }
  };
  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  const session = generateSession({ language: "russian", category: "travel", count: 5, random: () => 0 });

  const reversed = session.questions.filter((q: any) => q.direction === "reverse" && q.type === "mc_sentence");
  for (const q of reversed) {
    for (const opt of (q.options as string[])) {
      // No option should contain Cyrillic characters
      assert.ok(
        !/[а-яёА-ЯЁ]/.test(opt),
        `option "${opt}" contains Cyrillic characters — non-Latin prompts leaked into English distractors`
      );
    }
  }
});

test("instruction-prompt items (dictation) are not used as English distractors", () => {
  const course = {
    russian: {
      travel: [
        { id: "ru-main", level: "a1", difficulty: "a1", exerciseType: "mc_sentence", prompt: "I need a hotel room.", correctAnswer: "Мне нужен номер в отеле." },
        // Dictation prompt is a fixed instruction, not a translatable English phrase — must not leak in.
        { id: "ru-dictation", level: "a1", difficulty: "a1", exerciseType: "dictation_sentence", prompt: "Listen and build the sentence you hear.", correctAnswer: "Банк предлагает выгодные условия." },
        { id: "ru-3", level: "a1", difficulty: "a1", exerciseType: "mc_sentence", prompt: "Where is the exit?", correctAnswer: "Где выход?" },
        { id: "ru-4", level: "a1", difficulty: "a1", exerciseType: "mc_sentence", prompt: "How much is the ticket?", correctAnswer: "Сколько стоит билет?" },
        { id: "ru-5", level: "a2", difficulty: "a2", exerciseType: "mc_sentence", prompt: "Can you help me find the platform?", correctAnswer: "Вы можете помочь найти платформу?" }
      ]
    }
  };
  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(selectors.getCategoryItems, selectors.getAllItems);
  const session = generateSession({ language: "russian", category: "travel", count: 5, random: () => 0 });

  const reversed = session.questions.filter((q: any) => q.direction === "reverse" && q.type === "mc_sentence");
  for (const q of reversed) {
    for (const opt of (q.options as string[])) {
      assert.ok(
        !/listen and (type|build)/i.test(opt),
        `option "${opt}" is a dictation instruction — instruction prompts leaked into English distractors`
      );
    }
  }
});
