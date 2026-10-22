# Content Quality Checklist

Use this checklist before merging content-heavy updates.

## Automated checks

- `npm run lint:content` lists mechanical defects per course: untranslated answers, options that
  lack the answer, British spelling, and more (rules in `server/src/data/contentLint.ts`). Errors
  fail the `content_lint` test unless they are listed in `server/content/lint-baseline.json`, which
  may only shrink; warnings are hints for review. Add `--warnings`, `--lang=<course>` or
  `--rule=<rule>` for detail.
- A warning that turns out to be correct content (a cognate such as French `six`, an answer the
  language guess misreads) goes in `server/content/lint-accepted.json` with a one-line reason.
  Accepted warnings are hidden from the report, `--status` and work orders; the `content_lint`
  test fails on an entry that no longer matches a warning.

## AI review through work orders

An AI of your choice reviews one category file at a time like a native-speaking teacher, using
Russian items as the reference standard. No API key is involved: the review runs in your own AI
client. A **work order** (`scripts/content-review/workOrders.ts`) holds the rubric, the items,
their lint findings and the Russian reference items; the AI returns findings with field-level
fixes, which are validated against the work order and stored in
`server/content/reviews/<course>/<category>.json`.

**With an MCP client** (Claude Desktop, Claude Code, Cursor, …), register the server once. For
Claude Desktop, add this to `%APPDATA%\Claude\claude_desktop_config.json` under `mcpServers` and
restart the app:

```json
"lingoflow-content": {
  "command": "node",
  "args": ["--experimental-strip-types", "D:\\Code\\Codex\\lingoflow\\scripts\\content-review\\mcp.ts"]
}
```

Then ask "Review the German numbers_math category", or pick the `review_course` prompt. The tools
are `content_status`, `get_work_order`, `submit_review`, `list_findings` and `apply_fixes`.

**With any other AI**, use files:

1. `npm run review:content -- --export --lang=german [--category=work]` writes work orders to
   `server/content/reviews/work-orders/` (gitignored).
2. Give one to the AI (attach or paste) and save its reply.
3. `npm run review:content -- --import=reply.txt` validates and stores it; on a problem, show the
   AI the error and import its corrected reply.

**Either way, finish in the terminal:**

- `npm run review:content -- --status [--lang=german]` shows lint counts and review state per
  category.
- `npm run review:content -- --findings --lang=german` lists open findings.
- `npm run review:content -- --apply --lang=german [--category=work] [--severity=error]` writes the
  fixes; items edited since their review are skipped. `--apply-all` does the same for every course.
  Check the `git diff`, then run `npm run lint:content` and `npm run test`.

## Baseline metrics

- Confirm `/api/content/metrics` returns the target language(s).
- Check per-category `levelCounts` and flag `underTargetByLevel` buckets.
- Check `exerciseTypeCounts` to avoid one-type dominance in a category.

## Review rubric

- Prompt clarity: prompt is unambiguous and context-specific.
- CEFR fit: phrase complexity matches the tagged level.
- Distractor quality: alternatives are plausible but clearly wrong.
- Hint usefulness: hint supports process, not direct answer leakage.
- Cultural/usage accuracy: phrasing sounds natural for the target language.

## Session behavior spot-check

- Generate at least 3 sessions in the updated category.
- Confirm no obvious repeated-question-type streaks.
- Confirm at least one easier and one stretch question appears in daily sessions when available.
