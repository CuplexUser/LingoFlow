// Questions for the practice modes: speak, listen and words.
const { shuffle, resolveAnswer, stripExercisePrefix } = require("./itemText.ts");
const { pickLevelAwareDistractors } = require("./distractors.ts");
const { buildMediaFields, buildAcceptedAnswers } = require("./questions.ts");

function createPracticeSpeakQuestion(item) {
  const answer = resolveAnswer(item);
  return {
    id: item.id,
    type: "practice_speak",
    exerciseType: "practice_speak",
    level: item.level,
    prompt: "Pronounce the phrase.",
    answer,
    correctAnswer: answer,
    acceptedAnswers: buildAcceptedAnswers(answer),
    objective: "practice-speak",
    ...buildMediaFields(item)
  };
}

function createPracticeListenQuestion(item, pool, randomFn, language = "") {
  const answer = resolveAnswer(item);
  const distractors = pickLevelAwareDistractors(pool, item, 3, randomFn, language);
  return {
    id: item.id,
    type: "practice_listen",
    exerciseType: "practice_listen",
    level: item.level,
    prompt: "Listen and choose the correct phrase.",
    answer,
    correctAnswer: answer,
    options: shuffle([answer, ...distractors], randomFn),
    acceptedAnswers: buildAcceptedAnswers(answer),
    objective: "practice-listen",
    ...buildMediaFields(item)
  };
}

function createPracticeWordsQuestion(items) {
  const pairs = items.map((item) => ({
    left: resolveAnswer(item),
    right: stripExercisePrefix(item.prompt || "")
  })).filter((pair) => pair.left && pair.right && pair.left !== pair.right);

  return {
    id: `practice-words-${Date.now()}`,
    type: "practice_words",
    exerciseType: "practice_words",
    level: "a1",
    prompt: "Match each word to its translation.",
    pairs
  };
}

module.exports = {
  createPracticeSpeakQuestion,
  createPracticeListenQuestion,
  createPracticeWordsQuestion
};
