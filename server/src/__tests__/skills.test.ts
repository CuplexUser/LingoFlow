import type {} from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadSkillCatalog, createSkillIndex } = require("../data/skills.ts");
const { COURSE, SKILLS } = require("../data.ts");

const catalog = {
  shared: [
    { id: "food_cooking.ordering", label: "Ordering food", kind: "function", level: "a1", units: ["food_cooking"] },
    { id: "food_cooking.what-you-eat", label: "What you eat", kind: "vocab", level: "a1", units: ["food_cooking"] }
  ],
  byLanguage: {
    german: [{ id: "german.food_cooking.bakery", label: "At the bakery", kind: "vocab", level: "a1", units: ["food_cooking"] }]
  }
};

const course = {
  english: {
    food_cooking: [
      { id: "en-fo-1", level: "a1", skills: ["food_cooking.ordering"] },
      { id: "en-fo-2", level: "a1", skills: ["food_cooking.what-you-eat"] }
    ]
  },
  german: {
    food_cooking: [
      { id: "de-fo-1", level: "a1" },
      { id: "de-fo-2", level: "a1", skills: ["german.food_cooking.bakery"] },
      { id: "de-fo-9", level: "a1" },
      { id: "de-fo-a2-1", level: "a2", skills: ["no.such-skill"] }
    ]
  }
};

const index = createSkillIndex(course, catalog, { german: "english" });

test("an item's own skills win, then the English item's, then its unit's basics", () => {
  assert.deepEqual(index.getItemSkills("german", "de-fo-2"), ["german.food_cooking.bakery"]);
  assert.deepEqual(index.getItemSkills("german", "de-fo-1"), ["food_cooking.ordering"]);
  assert.deepEqual(index.getItemSkills("german", "de-fo-9"), ["food_cooking.a1.general"]);
  // A tag the catalog doesn't know is ignored rather than shown as a skill.
  assert.deepEqual(index.getItemSkills("german", "de-fo-a2-1"), ["food_cooking.a2.general"]);
});

test("a course's skills come back in catalog order, with generated ones last", () => {
  assert.deepEqual(
    index.getUnitSkills("german", "food_cooking", "a1").map((skill: any) => skill.id),
    ["food_cooking.ordering", "german.food_cooking.bakery", "food_cooking.a1.general"]
  );
  assert.equal(index.getSkill("german", "food_cooking.a1.general").label, "Food & Cooking basics");
  assert.deepEqual(index.getSkillItems("german", "food_cooking.ordering"), ["de-fo-1"]);
  // Skills no German item uses are not part of the German course.
  assert.equal(index.getSkill("german", "food_cooking.what-you-eat"), null);
});

test("a course can't inherit from a course that doesn't exist", () => {
  assert.throws(() => createSkillIndex(course, catalog, { german: "klingon" }), /unknown course "klingon"/);
});

test("the catalog loader rejects malformed skills", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  const write = (skills: unknown[]) => fs.writeFileSync(path.join(dir, "_shared.json"), JSON.stringify({ skills }));
  const valid = { id: "travel.hotel", label: "At the hotel", kind: "function", level: "a2", units: ["travel"] };
  write([valid]);
  assert.equal(loadSkillCatalog(dir).shared.length, 1);
  write([{ ...valid, kind: "idiom" }]);
  assert.throws(() => loadSkillCatalog(dir), /kind must be one of/);
  write([{ ...valid, units: ["space_travel"] }]);
  assert.throws(() => loadSkillCatalog(dir), /units must list known categories/);
  write([{ ...valid, id: "travel.a2.general" }]);
  assert.throws(() => loadSkillCatalog(dir), /kept for generated skills/);
  write([valid, valid]);
  assert.throws(() => loadSkillCatalog(dir), /duplicate skill id/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("every item in every course has a skill from the catalog", () => {
  const untagged: string[] = [];
  for (const [language, categories] of Object.entries(COURSE as Record<string, Record<string, any[]>>)) {
    for (const items of Object.values(categories)) {
      for (const item of items) {
        if (SKILLS.getItemSkills(language, item.id).some((id: string) => id.endsWith(".general"))) {
          untagged.push(`${language}/${item.id}`);
        }
      }
    }
  }
  assert.deepEqual(untagged, [], "Tag these items (see server/content/skills)");
});
