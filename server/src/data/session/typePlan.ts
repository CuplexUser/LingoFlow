// Which exercise type each item of a session is asked as, and which items a session kept
// to some types can ask at all.
const { resolveAnswer, normalizeComparableText, normalizeExerciseType } = require("./itemText.ts");

function buildQuestionTypePlan(items) {
  // Fill-in-the-blank is left out: masking a word of an ordinary sentence often leaves a gap
  // that more than one option fits. Cloze comes only from items authored as cloze.
  const cycle = ["mc_sentence", "build_sentence", "dictation_sentence", "dialogue_turn"];
  let cycleIndex = 0;
  const recent: string[] = [];
  return items.map((item) => {
    const fixedType = normalizeExerciseType(item?.exerciseType);
    if (fixedType) {
      recent.push(fixedType);
      if (recent.length > 2) recent.shift();
      return fixedType;
    }
    let type = cycle[cycleIndex % cycle.length];
    cycleIndex += 1;
    if (recent.length >= 2 && recent[0] === recent[1] && recent[1] === type) {
      type = cycle[cycleIndex % cycle.length];
      cycleIndex += 1;
    }
    recent.push(type);
    if (recent.length > 2) recent.shift();
    return type;
  });
}

// Keeps a session to the given exercise types (checks leave out the microphone, for one).
// Any other planned type becomes multiple choice, which every item can make, as mistake
// drills already do with flashcards.
function restrictTypes(planned: string[], allowed: string[]): string[] {
  if (!allowed.length) return planned;
  const fallback = allowed.includes("mc_sentence") ? "mc_sentence" : allowed[0];
  return planned.map((type) => (allowed.includes(type) ? type : fallback));
}

// Listening and speaking items that only work as themselves. A dictation item whose prompt
// is a listening instruction ("Listen and build the sentence you hear.") is written for its
// audio, hints included ("Listen for 'прежде чем'…"), and a pronunciation item may show the
// sentence to read out ("Say aloud: У меня болит голова."). As multiple choice the first
// asks nothing and the second shows the answer.
function isOnlyAskedAsItself(item): boolean {
  const type = normalizeExerciseType(item?.exerciseType);
  if (type !== "dictation_sentence" && type !== "pronunciation") return false;
  const prompt = String(item?.prompt || "").trim();
  if (/^listen\b/i.test(prompt)) return true;
  const answer = ` ${normalizeComparableText(resolveAnswer(item))} `;
  return answer.trim() !== "" && ` ${normalizeComparableText(prompt)} `.includes(answer);
}

// Whether an item can be asked in a session kept to the given exercise types.
function fitsQuestionTypes(item, allowed: string[]): boolean {
  if (!allowed.length || allowed.includes(normalizeExerciseType(item?.exerciseType))) return true;
  return !isOnlyAskedAsItself(item);
}

module.exports = {
  buildQuestionTypePlan,
  restrictTypes,
  fitsQuestionTypes
};
