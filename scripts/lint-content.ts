// Reports content defects across every course, using the rules in
// server/src/data/contentLint.ts.
//
// Errors are definite defects; warnings are heuristic signals worth a look. Errors that
// already existed when the check was introduced are listed in
// server/content/lint-baseline.json, which the content_lint test only lets shrink: a new
// error fails the test, and so does a fixed error that is still in the baseline.
//
// Usage:
//   npm run lint:content                         summary, depth figures, all errors
//   npm run lint:content -- --warnings           also list every warning
//   npm run lint:content -- --lang=german        only German
//   npm run lint:content -- --rule=generic-hint  only that rule (errors or warnings)
//   npm run lint:content -- --json               machine-readable findings
//   npm run lint:content -- --update-baseline    rewrite the baseline to the current errors

const fs = require("node:fs");
const path = require("node:path");

const {
  RULES,
  lintContent,
  contentDepth,
  listLanguages,
  baselineKey,
  BASELINE_PATH
} = require("../server/src/data/contentLint.ts");

type Finding = {
  language: string;
  category: string;
  id: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) =>
  args.find((arg: string) => arg.startsWith(`--${name}=`))?.split("=")[1];

const languages: string[] = option("lang") ? [option("lang") as string] : listLanguages();
const ruleFilter = option("rule");

let findings: Finding[] = lintContent(languages);

if (flag("update-baseline")) {
  if (option("lang")) {
    console.error("--update-baseline covers every language; drop --lang.");
    process.exit(1);
  }
  const keys = [...new Set(findings.filter((f) => f.severity === "error").map(baselineKey))].sort();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(keys, null, 2) + "\n");
  console.log(
    `Wrote ${keys.length} baseline entries to ${path.relative(process.cwd(), BASELINE_PATH)}`
  );
  process.exit(0);
}

if (ruleFilter) findings = findings.filter((f) => f.rule === ruleFilter);

if (flag("json")) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(0);
}

const baseline = new Set<string>(
  fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : []
);

// A plain left-aligned text table; console.table quotes every string cell.
function printTable(headers: string[], rows: Array<Array<string | number>>) {
  const cells = [headers, ...rows].map((row) => row.map((cell) => String(cell)));
  const widths = headers.map((_, col) => Math.max(...cells.map((row) => row[col].length)));
  for (const [index, row] of cells.entries()) {
    console.log("  " + row.map((cell, col) => cell.padEnd(widths[col])).join("  "));
    if (index === 0) console.log("  " + widths.map((width) => "-".repeat(width)).join("  "));
  }
}

// Rule × language counts, errors first.
const rules = Object.keys(RULES)
  .filter((rule) => findings.some((f) => f.rule === rule))
  .sort((a, b) =>
    RULES[a].severity === RULES[b].severity ? 0 : RULES[a].severity === "error" ? -1 : 1
  );
console.log("\nFindings by rule and language\n");
printTable(
  ["rule", "severity", ...languages],
  rules.map((rule) => [
    rule,
    RULES[rule].severity,
    ...languages.map(
      (language) => findings.filter((f) => f.rule === rule && f.language === language).length || ""
    )
  ])
);

if (!ruleFilter) {
  console.log("\nCourse depth\n");
  printTable(
    [
      "language",
      "items",
      "a1",
      "a2",
      "b1",
      "b2",
      "culturalNotes",
      "acceptedAnswers",
      "authoredDistractors",
      "distinctHints"
    ],
    contentDepth(languages).map((row: any) => [
      row.language,
      row.items,
      row.levels.a1 || 0,
      row.levels.a2 || 0,
      row.levels.b1 || 0,
      row.levels.b2 || 0,
      row.culturalNotes,
      row.acceptedAnswers,
      row.authoredDistractors,
      `${Math.round(row.distinctHintRatio * 100)}%`
    ])
  );
}

const printGroup = (title: string, group: Finding[]) => {
  if (!group.length) return;
  console.log(`\n${title} (${group.length})`);
  let current = "";
  for (const f of group) {
    const heading = `${f.language}/${f.category}.json`;
    if (heading !== current) {
      console.log(`\n  ${heading}`);
      current = heading;
    }
    const known = f.severity === "error" && baseline.has(baselineKey(f)) ? " [baseline]" : "";
    console.log(`    ${f.id.padEnd(18)} ${f.rule}${known}: ${f.message}`);
  }
};

const byLocation = (a: Finding, b: Finding) =>
  a.language.localeCompare(b.language) ||
  a.category.localeCompare(b.category) ||
  a.id.localeCompare(b.id);

printGroup("Errors", findings.filter((f) => f.severity === "error").sort(byLocation));
if (flag("warnings") || ruleFilter) {
  printGroup("Warnings", findings.filter((f) => f.severity === "warning").sort(byLocation));
} else {
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  if (warningCount)
    console.log(`\n${warningCount} warnings not shown; pass --warnings to list them.`);
}
console.log("");
