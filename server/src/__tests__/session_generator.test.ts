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
