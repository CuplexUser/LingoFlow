const test = require("node:test");
const assert = require("node:assert/strict");

const { createCourseSelectors, createSessionGenerator } = require("../data/sessionGenerator.ts");

test("matching questions do not include roleplay prompts as distractors", () => {
  const course = {
    english: {
      culture_history: [
        {
          id: "match-item",
          level: "a1",
          difficulty: "a1",
          prompt: "a tradition",
          correctAnswer: "a tradition",
          exerciseType: "matching"
        },
        {
          id: "roleplay-item",
          level: "b1",
          difficulty: "b1",
          prompt: "Choose the best response. Who built this castle?",
          correctAnswer: "It was built by a king.",
          exerciseType: "roleplay"
        },
        {
          id: "flashcard-item",
          level: "a1",
          difficulty: "a1",
          prompt: "a museum ticket",
          correctAnswer: "a museum ticket",
          exerciseType: "flashcard"
        },
        {
          id: "build-item",
          level: "a1",
          difficulty: "a1",
          prompt: "Say: This statue is famous.",
          correctAnswer: "This statue is famous.",
          exerciseType: "build_sentence"
        }
      ]
    }
  };

  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(
    selectors.getCategoryItems,
    selectors.getAllItems
  );
  const session = generateSession({
    language: "english",
    category: "culture_history",
    count: 4,
    random: () => 0
  });

  const matchingQuestion = session.questions.find((question) => question.type === "matching");
  assert.ok(matchingQuestion, "expected a matching question");

  const pairs = Array.isArray(matchingQuestion.pairs) ? matchingQuestion.pairs : [];
  assert.equal(
    pairs.some((pair) => pair.id === "roleplay-item"),
    false,
    "roleplay items should not be included in matching pairs"
  );
  assert.equal(
    pairs.some((pair) => /who built this castle\?/i.test(String(pair.prompt || ""))),
    false,
    "roleplay prompts should not appear in matching UI"
  );
});

test("multiple choice sentence options avoid single-word distractors", () => {
  const course = {
    english: {
      news_media: [
        {
          id: "news-main",
          level: "a2",
          difficulty: "a2",
          prompt: "I read the news every morning.",
          correctAnswer: "I read the news every morning.",
          exerciseType: "multiple_choice"
        },
        {
          id: "news-sentence-1",
          level: "a2",
          difficulty: "a2",
          prompt: "The reporter interviewed several witnesses.",
          correctAnswer: "The reporter interviewed several witnesses.",
          exerciseType: "multiple_choice"
        },
        {
          id: "news-sentence-2",
          level: "a2",
          difficulty: "a2",
          prompt: "We watched the evening bulletin together.",
          correctAnswer: "We watched the evening bulletin together.",
          exerciseType: "multiple_choice"
        },
        {
          id: "news-word-1",
          level: "a2",
          difficulty: "a2",
          prompt: "Headline",
          correctAnswer: "Headline",
          exerciseType: "multiple_choice"
        },
        {
          id: "news-word-2",
          level: "a2",
          difficulty: "a2",
          prompt: "Broadcast",
          correctAnswer: "Broadcast",
          exerciseType: "multiple_choice"
        }
      ]
    }
  };

  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(
    selectors.getCategoryItems,
    selectors.getAllItems
  );
  const session = generateSession({
    language: "english",
    category: "news_media",
    count: 5,
    random: () => 0
  });

  const multipleChoiceQuestion = session.questions.find((question) => question.id === "news-main");
  assert.ok(multipleChoiceQuestion, "expected a multiple-choice question");
  assert.equal(multipleChoiceQuestion.type, "mc_sentence");
  assert.ok(Array.isArray(multipleChoiceQuestion.options));

  const distractors = multipleChoiceQuestion.options.filter(
    (option) => option !== "I read the news every morning."
  );
  assert.ok(distractors.length > 0, "expected at least one distractor");
  assert.equal(
    distractors.some((option) => option.trim().split(/\s+/g).filter(Boolean).length < 3),
    false,
    "sentence-style prompts should not receive single-word distractors"
  );
});

test("build sentence tokens strip wrapping guillemets and punctuation", () => {
  const course = {
    russian: {
      science_technology: [
        {
          id: "ru-build-main",
          level: "a2",
          difficulty: "a2",
          prompt: "Build the sentence.",
          correctAnswer: "Я изучаю «науки и технологии».",
          exerciseType: "build_sentence"
        },
        {
          id: "ru-build-noise",
          level: "a2",
          difficulty: "a2",
          prompt: "Say: Это интересный курс.",
          correctAnswer: "Это интересный курс.",
          exerciseType: "build_sentence"
        }
      ]
    }
  };

  const selectors = createCourseSelectors(course);
  const generateSession = createSessionGenerator(
    selectors.getCategoryItems,
    selectors.getAllItems
  );
  const session = generateSession({
    language: "russian",
    category: "science_technology",
    count: 2,
    random: () => 0
  });

  const buildQuestion = session.questions.find((question) => question.id === "ru-build-main");
  assert.ok(buildQuestion, "expected a build sentence question");
  assert.equal(buildQuestion.type, "build_sentence");
  assert.ok(Array.isArray(buildQuestion.tokens));
  // Guillemets must be stripped from all tokens
  assert.equal(
    buildQuestion.tokens.some((token) => token.startsWith("«") || token.endsWith("»")),
    false,
    "build tokens should not keep wrapping guillemet markers"
  );
  // Sentence-ending punctuation is preserved on the last answer word only (one token max)
  const trailingPunctTokens = buildQuestion.tokens.filter((token) => /[.?!]$/.test(token));
  assert.ok(
    trailingPunctTokens.length <= 1,
    "at most one token may carry trailing sentence punctuation"
  );
  assert.ok(
    buildQuestion.tokens.includes("науки"),
    "expected cleaned core token for quoted word"
  );
});
