import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

const database = require("../db.ts");

function makeUser(suffix: string) {
  const user = database.createUser({
    email: `speed-${suffix}@example.com`,
    passwordHash: "hash",
    displayName: "Tester"
  });
  assert.ok(user, "expected a user to be created");
  return user.id;
}

test("updateSpeedMatchHighscore only raises the personal best", () => {
  const userId = makeUser("highscore");

  assert.equal(database.getSpeedMatchHighscore(userId, "spanish"), 0);

  let result = database.updateSpeedMatchHighscore(userId, "spanish", 12);
  assert.deepEqual(result, { highscore: 12, isNewBest: true });

  // A lower score does not lower the best and is not a new best.
  result = database.updateSpeedMatchHighscore(userId, "spanish", 5);
  assert.deepEqual(result, { highscore: 12, isNewBest: false });

  // An equal score is not a new best either.
  result = database.updateSpeedMatchHighscore(userId, "spanish", 12);
  assert.deepEqual(result, { highscore: 12, isNewBest: false });

  // A higher score raises it.
  result = database.updateSpeedMatchHighscore(userId, "spanish", 20);
  assert.deepEqual(result, { highscore: 20, isNewBest: true });

  assert.equal(database.getSpeedMatchHighscore(userId, "spanish"), 20);
});

test("highscore is tracked per language", () => {
  const userId = makeUser("perlang");
  database.updateSpeedMatchHighscore(userId, "spanish", 8);
  assert.equal(database.getSpeedMatchHighscore(userId, "spanish"), 8);
  assert.equal(database.getSpeedMatchHighscore(userId, "french"), 0);
});

test("flashcard known flag is persisted and surfaced via getKnownFlashcardItems", () => {
  const userId = makeUser("known");
  const today = database.toIsoDate();

  // A flashcard marked Known.
  database.upsertItemProgressAttempt({
    userId,
    language: "spanish",
    category: "greetings",
    itemId: "es-1",
    objective: "obj",
    correct: true,
    errorType: "none",
    today,
    flashcardKnown: true
  });

  // A normal correct attempt that was not a flashcard "Known".
  database.upsertItemProgressAttempt({
    userId,
    language: "spanish",
    category: "greetings",
    itemId: "es-2",
    objective: "obj",
    correct: true,
    errorType: "none",
    today,
    flashcardKnown: false
  });

  const known = database.getKnownFlashcardItems(userId, "spanish");
  const knownIds = known.map((entry: any) => entry.itemId);
  assert.ok(knownIds.includes("es-1"), "known flashcard should be listed");
  assert.ok(!knownIds.includes("es-2"), "non-known item should not be listed");
});

test("known flag is not downgraded by a later non-known attempt", () => {
  const userId = makeUser("sticky");
  const today = database.toIsoDate();

  database.upsertItemProgressAttempt({
    userId, language: "italian", category: "food", itemId: "it-1",
    objective: "obj", correct: true, errorType: "none", today, flashcardKnown: true
  });
  database.upsertItemProgressAttempt({
    userId, language: "italian", category: "food", itemId: "it-1",
    objective: "obj", correct: true, errorType: "none", today, flashcardKnown: false
  });

  const knownIds = database.getKnownFlashcardItems(userId, "italian").map((e: any) => e.itemId);
  assert.ok(knownIds.includes("it-1"), "known flag should remain set");
});
