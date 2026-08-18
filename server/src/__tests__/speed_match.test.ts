import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

// Schema creation is an awaited bootstrap now rather than an import side effect.
test.before(async () => {
  await initTestDb();
});

const database = require("../db.ts");

async function makeUser(suffix: string) {
  const user = await database.createUser({
    email: `speed-${suffix}@example.com`,
    passwordHash: "hash",
    displayName: "Tester"
  });
  assert.ok(user, "expected a user to be created");
  return user.id;
}

test("updateSpeedMatchHighscore only raises the personal best", async () => {
  const userId = await makeUser("highscore");

  assert.equal(await database.getSpeedMatchHighscore(userId, "spanish"), 0);

  let result = await database.updateSpeedMatchHighscore(userId, "spanish", 12);
  assert.deepEqual(result, { highscore: 12, isNewBest: true });

  // A lower score does not lower the best and is not a new best.
  result = await database.updateSpeedMatchHighscore(userId, "spanish", 5);
  assert.deepEqual(result, { highscore: 12, isNewBest: false });

  // An equal score is not a new best either.
  result = await database.updateSpeedMatchHighscore(userId, "spanish", 12);
  assert.deepEqual(result, { highscore: 12, isNewBest: false });

  // A higher score raises it.
  result = await database.updateSpeedMatchHighscore(userId, "spanish", 20);
  assert.deepEqual(result, { highscore: 20, isNewBest: true });

  assert.equal(await database.getSpeedMatchHighscore(userId, "spanish"), 20);
});

test("highscore is tracked per language", async () => {
  const userId = await makeUser("perlang");
  await database.updateSpeedMatchHighscore(userId, "spanish", 8);
  assert.equal(await database.getSpeedMatchHighscore(userId, "spanish"), 8);
  assert.equal(await database.getSpeedMatchHighscore(userId, "french"), 0);
});

test("flashcard known flag is persisted and surfaced via getKnownFlashcardItems", async () => {
  const userId = await makeUser("known");
  const today = database.toIsoDate();

  // A flashcard marked Known.
  await database.upsertItemProgressAttempt({
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
  await database.upsertItemProgressAttempt({
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

  const known = await database.getKnownFlashcardItems(userId, "spanish");
  const knownIds = known.map((entry: any) => entry.itemId);
  assert.ok(knownIds.includes("es-1"), "known flashcard should be listed");
  assert.ok(!knownIds.includes("es-2"), "non-known item should not be listed");
});

test("known flag is not downgraded by a later non-known attempt", async () => {
  const userId = await makeUser("sticky");
  const today = database.toIsoDate();

  await database.upsertItemProgressAttempt({
    userId, language: "italian", category: "food", itemId: "it-1",
    objective: "obj", correct: true, errorType: "none", today, flashcardKnown: true
  });
  await database.upsertItemProgressAttempt({
    userId, language: "italian", category: "food", itemId: "it-1",
    objective: "obj", correct: true, errorType: "none", today, flashcardKnown: false
  });

  const knownIds = (await database.getKnownFlashcardItems(userId, "italian")).map((e: any) => e.itemId);
  assert.ok(knownIds.includes("it-1"), "known flag should remain set");
});
