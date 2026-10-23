import type {} from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  lintContent,
  lintItems,
  baselineKey,
  loadBaseline,
  loadAccepted,
  detectLanguage
} = require("../data/contentLint.ts");

const findings = lintContent(undefined, { includeAccepted: true });
const baseline = new Set(loadBaseline());
const errorKeys = new Set(
  findings.filter((finding: any) => finding.severity === "error").map(baselineKey)
);

test("course content has no lint errors outside the baseline", () => {
  const fresh = findings.filter(
    (finding: any) => finding.severity === "error" && !baseline.has(baselineKey(finding))
  );
  assert.deepEqual(
    fresh.map((finding: any) => `${baselineKey(finding)}: ${finding.message}`),
    [],
    "Fix these content errors (details: npm run lint:content)"
  );
});

test("the lint baseline lists only errors that still exist", () => {
  const fixed = [...baseline].filter((key) => !errorKeys.has(key as string));
  assert.deepEqual(
    fixed,
    [],
    "These baseline errors are fixed; run `npm run lint:content -- --update-baseline`"
  );
});

test("lint-accepted.json lists only warnings that still exist", () => {
  const warningKeys = new Set(
    findings.filter((finding: any) => finding.severity === "warning").map(baselineKey)
  );
  const stale = Object.keys(loadAccepted()).filter((key) => !warningKeys.has(key));
  assert.deepEqual(stale, [], "Remove these entries from server/content/lint-accepted.json");
});

test("detectLanguage tells the course languages apart", () => {
  assert.equal(detectLanguage("The stakeholders have concerns about the return."), "english");
  assert.equal(detectLanguage("Las partes interesadas tienen dudas sobre el retorno."), "spanish");
  assert.equal(detectLanguage("Ich habe keine Zeit, aber ich komme morgen mit dir."), "german");
  assert.equal(detectLanguage("Jag har inte tid i dag, men vi ses på fredag."), "swedish");
  assert.equal(detectLanguage("Je ne suis pas sûr que nous avons le temps."), "french");
  assert.equal(detectLanguage("Non ho tempo oggi, ma sono sempre qui per te."), "italian");
  assert.equal(detectLanguage("У меня болит голова."), "russian");
  assert.equal(detectLanguage("tiger"), "");
});

function clozeRules(item: Record<string, unknown>): string[] {
  const base = { id: "es-test-1", level: "a2", difficulty: "a2", exerciseType: "cloze_sentence", hints: ["Preterite of 'comer', 'we' form."] };
  return lintItems([{ ...base, ...item }], "spanish", "food_cooking")
    .map((finding: any) => finding.rule)
    .filter((rule: string) => rule.startsWith("cloze-"));
}

test("a cloze item needs a translation and three wrong options", () => {
  assert.deepEqual(
    clozeRules({ prompt: "___ en un pequeño restaurante familiar.", correctAnswer: "Comimos" }),
    ["cloze-missing-translation", "cloze-options-missing"]
  );
  assert.deepEqual(
    clozeRules({
      prompt: "___ en un pequeño restaurante familiar.",
      correctAnswer: "Comimos",
      translation: "We ate at a small family restaurant.",
      clozeOptions: ["Comimos", "Comemos", "Comieron", "Comí"]
    }),
    []
  );
});

test("a cloze option that also fits the gap is an error, and a case difference a warning", () => {
  const findings = lintItems([{
    id: "es-test-2", level: "b1", difficulty: "b1", exerciseType: "cloze_sentence",
    prompt: "¿Cuáles son las ___ de cocinar en casa?",
    correctAnswer: "ventajas",
    acceptedAnswers: ["beneficios"],
    translation: "What are the advantages of cooking at home?",
    clozeOptions: ["ventajas", "beneficios", "Recetas", "cucharas"],
    hints: ["Plural noun: the good sides of something."]
  }], "spanish", "food_cooking");
  const rules = findings.map((finding: any) => `${finding.rule}:${finding.severity}`);
  assert.ok(rules.includes("cloze-option-is-accepted:error"));
  assert.ok(rules.includes("cloze-case-tell:warning"));
});

test("a skill tag must exist and belong to the item's unit and level", () => {
  const rulesFor = (skills: string[], level = "a1") =>
    lintItems([{
      id: "es-test-3", level, difficulty: level, prompt: "Say: I am hungry.", correctAnswer: "Tengo hambre.",
      hints: ["'Tener hambre' = to be hungry."], skills
    }], "spanish", "food_cooking")
      .map((finding: any) => `${finding.rule}:${finding.severity}`)
      .filter((rule: string) => rule.startsWith("skill-"));
  assert.deepEqual(rulesFor(["food_cooking.ordering"]), []);
  assert.deepEqual(rulesFor(["food_cooking.no-such-skill"]), ["skill-unknown:error"]);
  assert.deepEqual(rulesFor(["travel.hotel"]), ["skill-wrong-unit:error"]);
  assert.deepEqual(rulesFor(["food_cooking.ordering"], "b2"), ["skill-wrong-unit:error"]);
  // Russian's own skills are not available to other courses.
  assert.deepEqual(rulesFor(["russian.grammar.aspect"]), ["skill-unknown:error"]);
});

test("cloze rules leave the English source alone", () => {
  const findings = lintItems([{
    id: "en-test-1", level: "a2", difficulty: "a2", exerciseType: "cloze_sentence",
    prompt: "We ___ at a small family restaurant.", correctAnswer: "ate"
  }], "english", "food_cooking");
  assert.deepEqual(findings.filter((finding: any) => finding.rule.startsWith("cloze-")), []);
});
