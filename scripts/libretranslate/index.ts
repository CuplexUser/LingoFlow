#!/usr/bin/env node --experimental-strip-types

// LingoFlow LibreTranslate content generator — interactive entry point.
//
// This file is pure orchestration: it decides which menus to show in which order
// (the wizard) and hands the chosen work to the content generator. The reusable
// pieces live in two modules with a one-way dependency from here:
//   - ./terminal-menu      — generic interactive prompts (no content knowledge)
//   - ./content-generator  — translation + JSON file IO (no menu knowledge)

import * as fs from "node:fs";
import * as readline from "node:readline";
import { ANSI, chooseMany, chooseOne, color, showNotice, type Choice } from "./terminal-menu.ts";
import {
  CallPacer,
  LibreTranslateRequestError,
  PRACTICE_WORDS_CATEGORY,
  PRACTICE_WORDS_ID,
  RATE_LIMITS,
  SERVER_ENV_PATH,
  STORIES_CATEGORY,
  STORIES_ID,
  TARGET_LANGUAGES,
  TRANSLATE_BATCH_SIZE,
  assertCanWriteContent,
  assertCanWriteStories,
  countUniqueTexts,
  describeLanguagePaths,
  formatDuration,
  getCategoryChoices,
  getOutputPath,
  isLanguageReady,
  loadEnv,
  loadRateLimitPreference,
  relPath,
  saveRateLimitPreference,
  translateCategory,
  translateStories,
  type Category,
  type CompletedCategoryStats,
  type LibreTranslateConfig,
  type RateLimitChoice,
  type TargetLanguage,
  type TranslateProgress
} from "./content-generator.ts";

type ContentType = "categories" | "practice_words" | "stories";
type WizardStep = "language" | "contentType" | "categories" | "rateLimit" | "confirm";
type CompletionAction = "again" | "exit";

interface ContentTypeChoice extends Choice {
  value: ContentType;
}

interface ConfirmChoice extends Choice {
  action: "start" | "back";
}

interface CompletionChoice extends Choice {
  action: CompletionAction;
}

interface WizardResult {
  language: TargetLanguage;
  contentType: ContentType;
  categories: Category[];
  rateLimit: RateLimitChoice;
}

const CONTENT_TYPES: ContentTypeChoice[] = [
  { label: "Course categories", value: "categories" },
  { label: "Practice words", value: "practice_words" },
  { label: "Stories (Story Reader)", value: "stories" }
];

function cancelRun(): never {
  throw new Error("Cancelled.");
}

function renderProgress(progress: TranslateProgress): void {
  const width = 28;
  const ratio = progress.totalWords === 0 ? 1 : progress.done / progress.totalWords;
  const filled = Math.round(width * ratio);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;

  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(
    `${progress.category.label} [${bar}] ${progress.done}/${progress.totalWords} avg call ${formatDuration(
      progress.averageCallMs
    )}`
  );
}

function buildSummaryLines(
  language: TargetLanguage,
  contentType: ContentType,
  categories: Category[],
  rateLimit: RateLimitChoice
): string[] {
  const totals = categories.reduce(
    (acc, category) => {
      const words = countUniqueTexts(category, language);
      acc.words += words;
      acc.calls += Math.ceil(words / TRANSLATE_BATCH_SIZE);
      return acc;
    },
    { words: 0, calls: 0 }
  );

  const contentSummary =
    contentType === "practice_words"
      ? "Practice words"
      : contentType === "stories"
        ? "Stories (English → target, plus a reverse glossary pass)"
        : `${categories.length} categor${categories.length === 1 ? "y" : "ies"} — ${categories
            .map((category) => category.label)
            .join(", ")}`;

  return [
    `${color("Language", ANSI.cyan)}    ${language.label} (${language.libreCode})`,
    `${color("Content", ANSI.cyan)}     ${contentSummary}`,
    `${color("Rate limit", ANSI.cyan)}  ${rateLimit.label}`,
    `${color("API calls", ANSI.cyan)}   about ${totals.calls} (${totals.words} words, ${TRANSLATE_BATCH_SIZE}/call)`,
    "",
    color(
      "This will create new JSON files only. Existing files are never overwritten.",
      ANSI.yellow
    )
  ];
}

async function collectWizardSelections(): Promise<WizardResult> {
  let language: TargetLanguage | undefined;
  let contentType: ContentType | undefined;
  let categories: Category[] | undefined;
  let rateLimit: RateLimitChoice | undefined;
  let step: WizardStep = "language";

  while (true) {
    if (step === "language") {
      const result = await chooseOne("LingoFlow LibreTranslate Generator", TARGET_LANGUAGES, {
        subtitle: "Select the language to generate content for (translated from English)."
      });
      if (result.action === "cancel") cancelRun();

      const picked = result.selected[0];
      if (!isLanguageReady(picked)) {
        const paths = describeLanguagePaths(picked);
        const action = await showNotice(
          `${picked.label} is not ready`,
          [
            `Expected directory: ${paths.dir}`,
            `Expected metadata:  ${paths.meta}`,
            "",
            "Create the language directory and _meta.json first, then run this tool again."
          ],
          true
        );
        if (action === "cancel") cancelRun();
        continue;
      }

      language = picked;
      step = "contentType";
      continue;
    }

    if (step === "contentType") {
      const result = await chooseOne("What do you want to generate?", CONTENT_TYPES, {
        allowBack: true,
        subtitle:
          "Course categories build the lesson content.\nPractice words build the vocabulary drill pool."
      });
      if (result.action === "cancel") cancelRun();
      if (result.action === "back") {
        step = "language";
        continue;
      }

      contentType = result.selected[0].value;

      if (contentType === "practice_words") {
        const outputPath = getOutputPath(language!, PRACTICE_WORDS_ID);
        if (fs.existsSync(outputPath)) {
          const action = await showNotice(
            `Practice words already exist for ${language!.label}`,
            [
              `File: ${relPath(outputPath)}`,
              "",
              "Delete it first if you want to regenerate the practice word pool."
            ],
            true
          );
          if (action === "cancel") cancelRun();
          continue;
        }
        categories = [PRACTICE_WORDS_CATEGORY];
        step = "rateLimit";
        continue;
      }

      if (contentType === "stories") {
        const outputPath = getOutputPath(language!, STORIES_ID);
        if (fs.existsSync(outputPath)) {
          const action = await showNotice(
            `Stories already exist for ${language!.label}`,
            [
              `File: ${relPath(outputPath)}`,
              "",
              "Delete it first if you want to regenerate the Story Reader content."
            ],
            true
          );
          if (action === "cancel") cancelRun();
          continue;
        }
        categories = [STORIES_CATEGORY];
        step = "rateLimit";
        continue;
      }

      categories = undefined;
      step = "categories";
      continue;
    }

    if (step === "categories") {
      const categoryChoices = getCategoryChoices(language!);
      const availableCount = categoryChoices.filter((category) => !category.disabledReason).length;
      const selectAll: Category = { id: "__all__", label: "Select all available" };
      const choices: Category[] = [selectAll, ...categoryChoices];

      const selected = new Set<number>();
      const previousIds = new Set((categories || []).map((category) => category.id));
      choices.forEach((choice, index) => {
        if (index === 0) return;
        if (!choice.disabledReason && previousIds.has(choice.id)) selected.add(index);
      });

      const subtitle =
        availableCount === 0
          ? "Every category already exists for this language. Press Backspace to go back."
          : "Space toggles a category. Existing files are marked and skipped.";

      const result = await chooseMany("Select categories", choices, {
        allowBack: true,
        selected,
        selectAllIndex: 0,
        subtitle
      });
      if (result.action === "cancel") cancelRun();
      if (result.action === "back") {
        step = "contentType";
        continue;
      }

      categories = result.selected.filter(
        (category) => category.id !== "__all__" && !category.disabledReason
      );
      step = "rateLimit";
      continue;
    }

    if (step === "rateLimit") {
      // Default to the current choice if revisiting this step, otherwise the value
      // saved from a previous session.
      const preferredValue = rateLimit?.value ?? loadRateLimitPreference();
      const defaultIndex = Math.max(
        0,
        RATE_LIMITS.findIndex((option) => option.value === preferredValue)
      );

      const result = await chooseOne("Select LibreTranslate rate limit", RATE_LIMITS, {
        allowBack: true,
        initialCursor: defaultIndex,
        selected: new Set([defaultIndex]),
        subtitle: "Client-side pacing — each batched request counts as one call."
      });
      if (result.action === "cancel") cancelRun();
      if (result.action === "back") {
        step = contentType === "categories" ? "categories" : "contentType";
        continue;
      }

      rateLimit = result.selected[0];
      saveRateLimitPreference(rateLimit.value);
      step = "confirm";
      continue;
    }

    // step === "confirm"
    const confirmChoices: ConfirmChoice[] = [
      { label: "Start translation", action: "start" },
      { label: "Back", action: "back" }
    ];
    const result = await chooseOne("Review translation job", confirmChoices, {
      allowBack: true,
      subtitle: buildSummaryLines(language!, contentType!, categories!, rateLimit!).join("\n")
    });
    if (result.action === "cancel") cancelRun();
    if (result.action === "back" || result.selected[0].action === "back") {
      step = "rateLimit";
      continue;
    }

    return {
      language: language!,
      contentType: contentType!,
      categories: categories!,
      rateLimit: rateLimit!
    };
  }
}

async function runTranslationJob(
  selections: WizardResult,
  configBase: LibreTranslateConfig
): Promise<"done" | "back"> {
  const { language, categories, contentType, rateLimit } = selections;
  const pacer = new CallPacer(rateLimit.value);
  const config: LibreTranslateConfig = { ...configBase, target: language.libreCode };
  const startedAt = Date.now();
  const completed: CompletedCategoryStats[] = [];
  const unresolved: string[] = [];
  let totalCalls = 0;
  let totalCallMs = 0;

  console.log(
    `\nCreating ${language.label} content from English with ${
      rateLimit.value ? `${rateLimit.value} calls/minute` : "no client-side rate limit"
    }.`
  );
  console.log("Only new files will be written. Existing files are never overwritten.");

  // Stories run a two-direction translation (sentences forward, glossary reverse)
  // that does not fit the per-category loop, so they get a dedicated path.
  if (contentType === "stories") {
    try {
      console.log("\nTranslating Stories (sentences English → target, then glossary target → English)");
      const result = await translateStories(language, config, pacer, renderProgress);
      process.stdout.write("\n");
      console.log(
        `Wrote ${relPath(result.outputPath)} — ${result.storyCount} stories in ${formatDuration(
          result.elapsed
        )} (${result.callCount} calls, avg ${formatDuration(result.averageCallMs)})`
      );
      if (result.unresolved.length) {
        console.log(
          color(
            `  ! ${result.unresolved.length} text(s) had no translation and kept the source. Review the glossary by hand.`,
            ANSI.yellow
          )
        );
      }
      console.log("\nDone.");
      return "done";
    } catch (error) {
      if (error instanceof LibreTranslateRequestError && error.status === 400) {
        const action = await showNotice(
          "LibreTranslate rejected the request",
          [error.message, "", "No story file was written.", "Go back to adjust your selection, or cancel."],
          true
        );
        if (action === "cancel") cancelRun();
        return "back";
      }
      throw error;
    }
  }

  try {
    for (const category of categories) {
      const words = countUniqueTexts(category, language);
      const batchCount = Math.ceil(words / TRANSLATE_BATCH_SIZE);
      console.log(
        `\nTranslating ${category.label} (${words} words in ${batchCount} batched calls)`
      );

      const result = await translateCategory(category, language, config, pacer, renderProgress);
      if (words > 0) process.stdout.write("\n");

      completed.push({
        category,
        elapsed: result.elapsed,
        callCount: result.callCount,
        averageCallMs: result.averageCallMs
      });
      totalCalls += result.callCount;
      totalCallMs += result.averageCallMs * result.callCount;

      console.log(
        `Wrote ${relPath(result.outputPath)} in ${formatDuration(result.elapsed)} (avg call ${formatDuration(
          result.averageCallMs
        )})`
      );

      if (result.unresolved.length) {
        unresolved.push(...result.unresolved);
        console.log(
          color(
            `  ! ${result.unresolved.length} word(s) had no translation and kept the English source: ${result.unresolved.join(
              ", "
            )}`,
            ANSI.yellow
          )
        );
      }
    }
  } catch (error) {
    if (error instanceof LibreTranslateRequestError && error.status === 400) {
      const action = await showNotice(
        "LibreTranslate rejected the request",
        [
          error.message,
          "",
          "No files were written for the category that failed.",
          "Go back to adjust your selection, or cancel the generator."
        ],
        true
      );
      if (action === "cancel") cancelRun();
      return "back";
    }
    throw error;
  }

  const totalElapsed = Date.now() - startedAt;
  const averageCallMs = totalCalls ? totalCallMs / totalCalls : 0;

  console.log("\nDone.");
  console.log(`Total time: ${formatDuration(totalElapsed)}`);
  console.log(`Total API calls: ${totalCalls}`);
  console.log(`Average API call: ${formatDuration(averageCallMs)}`);
  console.log("Category timings:");
  for (const row of completed) {
    console.log(
      `- ${row.category.label}: ${formatDuration(row.elapsed)}, ${row.callCount} calls, avg ${formatDuration(
        row.averageCallMs
      )}`
    );
  }

  if (unresolved.length) {
    console.log(
      color(
        `\n${unresolved.length} item(s) could not be translated and kept the English source text:`,
        ANSI.yellow
      )
    );
    for (const word of unresolved) console.log(`- ${word}`);
    console.log("Edit the generated file(s) to translate these by hand.");
  }

  return "done";
}

async function promptCompletion(): Promise<CompletionAction> {
  const choices: CompletionChoice[] = [
    { label: "Start another translation", action: "again" },
    { label: "Exit", action: "exit" }
  ];
  const result = await chooseOne("Translation complete", choices, {
    subtitle: "Generate more content, or exit the tool."
  });
  if (result.action === "cancel") return "exit";
  return result.selected[0].action;
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("This script is interactive and must be run in a terminal.");
  }

  process.stdout.write(ANSI.hideCursor);

  try {
    const env = loadEnv(SERVER_ENV_PATH);
    const libreUrl = String(env.LIBRETRANSLATE_URL || "").replace(/\/$/, "");
    const apiKey = String(env.LIBRETRANSLATE_API_KEY || "").trim();

    if (!libreUrl) throw new Error("LIBRETRANSLATE_URL is missing in server/.env");
    if (!apiKey) throw new Error("LIBRETRANSLATE_API_KEY is missing in server/.env");

    const configBase: LibreTranslateConfig = { url: libreUrl, apiKey, target: "" };

    while (true) {
      const selections = await collectWizardSelections();
      if (selections.contentType === "stories") {
        assertCanWriteStories(selections.language);
      } else {
        assertCanWriteContent(selections.language, selections.categories);
      }

      const result = await runTranslationJob(selections, configBase);
      if (result === "back") continue;

      const next = await promptCompletion();
      if (next === "exit") break;
    }
  } finally {
    process.stdout.write(ANSI.showCursor);
    // Release stdin so the process can exit cleanly instead of hanging on input.
    process.stdin.pause();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
