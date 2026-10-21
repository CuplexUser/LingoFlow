// MCP server for content review, so an AI client (Claude Desktop, Claude Code, Cursor, …)
// can take review work orders and return results through tools, with no API key: the
// review runs in the client, on the user's own plan.
//
// Register it in the client with the command
//   node --experimental-strip-types <repo>/scripts/content-review/mcp.ts
// (Claude Desktop: claude_desktop_config.json → mcpServers). Speaks MCP over stdio, so
// nothing here may write to stdout.

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const {
  LANGUAGES,
  CATEGORY_IDS,
  WorkOrderError,
  buildWorkOrder,
  submitReview,
  status,
  listFindings,
  applyFixes
} = require("./workOrders.ts");
const { ReviewResultShape } = require("./rubric.ts");

const language = z.enum(LANGUAGES).describe("Course id, e.g. german.");
const category = z.enum(CATEGORY_IDS).describe("Category id, e.g. numbers_math.");

// Runs a handler and turns its text, or a WorkOrderError, into a tool result.
function respond(run: () => string) {
  try {
    return { content: [{ type: "text", text: run() }] };
  } catch (error) {
    if (!(error instanceof WorkOrderError)) throw error;
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
}

const server = new McpServer({ name: "lingoflow-content-review", version: "1.0.0" });

server.registerTool(
  "content_status",
  {
    title: "Content status",
    description:
      "Lint error and warning counts and the review state of every category of a LingoFlow " +
      "course (or all courses). Use it to choose which category to review next.",
    inputSchema: { language: language.optional() },
    annotations: { readOnlyHint: true }
  },
  ({ language: lang }: { language?: string }) => respond(() => status(lang ? [lang] : undefined))
);

server.registerTool(
  "get_work_order",
  {
    title: "Get a review work order",
    description:
      "The work order for reviewing one category file of one course: the rubric, the items, " +
      "their lint findings and Russian reference items. Review every item, then call " +
      "submit_review with the work order id.",
    inputSchema: { language, category },
    annotations: { readOnlyHint: true }
  },
  ({ language: lang, category: cat }: { language: string; category: string }) =>
    respond(() => buildWorkOrder(lang, cat, "mcp"))
);

server.registerTool(
  "submit_review",
  {
    title: "Submit a review",
    description:
      "Store the findings of a completed work order. The result is validated against the " +
      "work order; on a problem the error lists what to correct before submitting again. " +
      "Submitting again for the same category replaces the stored review.",
    inputSchema: ReviewResultShape
  },
  (result: unknown) => respond(() => submitReview(result))
);

server.registerTool(
  "list_findings",
  {
    title: "List review findings",
    description:
      "Stored review findings and their fixes for a course, open ones unless include_applied.",
    inputSchema: {
      language,
      category: category.optional(),
      include_applied: z.boolean().optional()
    },
    annotations: { readOnlyHint: true }
  },
  (input: { language: string; category?: string; include_applied?: boolean }) =>
    respond(() => listFindings(input.language, input.category, Boolean(input.include_applied)))
);

server.registerTool(
  "apply_fixes",
  {
    title: "Apply review fixes",
    description:
      "Write stored fixes into the course's content files, optionally limited to one category, " +
      "one severity or some item ids. Items edited since their review are skipped. The user " +
      "checks the result with git diff.",
    inputSchema: {
      language,
      category: category.optional(),
      severity: z.enum(["error", "improvement"]).optional(),
      ids: z.array(z.string()).optional().describe("Only these item ids.")
    }
  },
  (input: {
    language: string;
    category?: string;
    severity?: "error" | "improvement";
    ids?: string[];
  }) => respond(() => applyFixes(input.language, input))
);

server.registerPrompt(
  "review_course",
  {
    title: "Review a course",
    description: "Review every category of a LingoFlow course, one work order at a time.",
    argsSchema: { language: z.string().describe(`One of: ${LANGUAGES.join(", ")}.`) }
  },
  ({ language: lang }: { language: string }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Review the ${lang} LingoFlow course. Call content_status for ${lang}, then for each ` +
            "category that is not reviewed, or whose review is outdated, call get_work_order, " +
            "review every item as it instructs, and call submit_review. Start with the " +
            "categories that have lint errors. After each category, tell me in one line how " +
            "many errors and improvements you found. Do not apply fixes unless I ask."
        }
      }
    ]
  })
);

server.connect(new StdioServerTransport()).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
