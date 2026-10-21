import type {} from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  lintContent,
  baselineKey,
  loadBaseline,
  detectLanguage
} = require("../data/contentLint.ts");

const findings = lintContent();
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
