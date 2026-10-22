// Content review through work orders that any AI can take, without an API key.
//
// With an MCP client (Claude Desktop, Claude Code, Cursor, …) register mcp.ts and ask the AI
// to review a course: it fetches work orders and submits results through tools. With any
// other AI, export a work order file, give it to the AI, and import the JSON it replies with.
// See docs/content-quality-checklist.md.
//
// Usage:
//   npm run review:content -- --status [--lang=german]           lint and review state
//   npm run review:content -- --export --lang=german [--category=work]
//                                                                 write work orders for a chat AI
//   npm run review:content -- --import=reply.txt                 store an AI's reply (file)
//   npm run review:content -- --import                           …or paste it on stdin
//   npm run review:content -- --findings --lang=german [--category=work] [--all]
//   npm run review:content -- --apply --lang=german [--category=work] [--severity=error]
//   npm run review:content -- --apply-all [--category=work] [--severity=error]
//                                                                 …the same for every course

const fs = require("node:fs");
const {
  LANGUAGES,
  CATEGORY_IDS,
  WorkOrderError,
  exportWorkOrders,
  extractJson,
  submitReview,
  status,
  listFindings,
  applyFixes
} = require("./workOrders.ts");

const args = process.argv.slice(2);
const flag = (name: string) =>
  args.some((arg: string) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const option = (name: string) =>
  args.find((arg: string) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const language = option("lang");
const category = option("category");
const severity = option("severity");

function requireLanguage(): string {
  if (!language)
    throw new WorkOrderError(`Pass --lang=<course>. Courses: ${LANGUAGES.join(", ")}.`);
  return language;
}

function readStdin(): string {
  return fs.readFileSync(0, "utf8");
}

function main(): string {
  if (flag("export"))
    return exportWorkOrders(requireLanguage(), category ? [category] : CATEGORY_IDS);
  if (flag("import")) {
    const file = option("import");
    if (!file)
      console.error("Paste the AI's reply, then press Ctrl+Z and Enter (Ctrl+D on macOS/Linux).");
    return submitReview(extractJson(file ? fs.readFileSync(file, "utf8") : readStdin()));
  }
  if (flag("findings")) return listFindings(requireLanguage(), category, flag("all"));
  if (flag("apply") || flag("apply-all")) {
    if (severity && severity !== "error" && severity !== "improvement") {
      throw new WorkOrderError("--severity must be error or improvement.");
    }
    const languages = flag("apply-all") ? LANGUAGES : [requireLanguage()];
    return languages
      .map((lang: string) => applyFixes(lang, { category, severity }))
      .join("\n\n");
  }
  return status(language ? [language] : undefined);
}

try {
  console.log(main());
} catch (error) {
  console.error(error instanceof WorkOrderError ? error.message : error);
  process.exit(1);
}
