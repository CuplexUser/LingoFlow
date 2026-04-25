#!/usr/bin/env npx tsx
/**
 * LingoFlow Duplicate Remover (Per File)
 *
 * Removes duplicate entries from language-learning JSON files based on exact
 * matches of the "prompt" field. Keeps the first occurrence of each prompt
 * (preserving your highest-quality version). Completely safe — supports dry-run.
 *
 * Usage:
 *   npx tsx scripts/deduplicate-prompts.ts conversation.json
 *   npx tsx scripts/deduplicate-prompts.ts --dry-run conversation.json
 *   npx tsx scripts/deduplicate-prompts.ts --output conversation-clean.json conversation.json
 *   npx tsx scripts/deduplicate-prompts.ts server/content/languages/russian/*.json --dry-run
 *
 * If no files are provided, the script automatically processes ALL *.json files
 * in the current working directory.
 *
 * Assumptions about your file layout:
 *   All .json files are valid JSON arrays of exercise objects containing a "prompt" field.
 *   Wildcards (*.json) are fully supported (cross-platform).
 */

import fs from "fs";
import path from "path";

interface Exercise {
  id?: string;
  prompt?: string;
  [key: string]: any;
}

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let outputPath: string | null = null;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "-d") {
      dryRun = true;
    } else if ((arg === "--output" || arg === "-o") && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }
  return { files, dryRun, outputPath };
}

/**
 * Simple glob expander for common patterns like folder/*.json
 */
function expandPatterns(patterns: string[]): string[] {
  const expanded: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      const dir = path.dirname(pattern) || process.cwd();
      const basename = path.basename(pattern);

      if (basename === "*.json" || basename === "*.JSON") {
        try {
          const items = fs.readdirSync(dir);
          const jsonFiles = items
            .filter((f) => f.toLowerCase().endsWith(".json"))
            .map((f) => path.join(dir, f));
          expanded.push(...jsonFiles);
        } catch {
          // ignore expansion errors
        }
      } else {
        expanded.push(pattern);
      }
    } else {
      expanded.push(pattern);
    }
  }

  return [...new Set(expanded)];
}

function main() {
  let { files, dryRun, outputPath } = parseArgs();

  // Auto-detect all .json files if none were provided
  if (files.length === 0) {
    try {
      files = fs.readdirSync(process.cwd())
        .filter((file) => file.toLowerCase().endsWith(".json"))
        .sort();
    } catch (err: any) {
      console.error("Error reading current directory:", err.message);
      process.exit(1);
    }
  } else {
    files = expandPatterns(files);
  }

  if (files.length === 0) {
    console.log("No JSON files found to process.");
    process.exit(0);
  }

  if (outputPath && files.length > 1) {
    console.error("Error: --output can only be used with a single file.");
    process.exit(1);
  }

  console.log(`Processing ${files.length} JSON file(s)...\n`);

  let totalProcessed = 0;
  let totalDuplicatesRemoved = 0;

  files.forEach((filePath) => {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
      console.warn(`Warning: File not found → ${filePath}`);
      return;
    }

    let data: Exercise[];
    try {
      const raw = fs.readFileSync(fullPath, "utf-8");
      data = JSON.parse(raw);

      if (!Array.isArray(data)) {
        console.warn(`Warning: ${filePath} is not a valid JSON array`);
        return;
      }
    } catch (err: any) {
      console.error(`Error reading ${filePath}: ${err.message}`);
      return;
    }

    const seen = new Set<string>();
    const cleaned: Exercise[] = [];
    let duplicatesRemoved = 0;

    data.forEach((item) => {
      const prompt = item.prompt?.toString().trim();
      if (!prompt) {
        cleaned.push(item);
        return;
      }

      if (seen.has(prompt)) {
        duplicatesRemoved++;
      } else {
        seen.add(prompt);
        cleaned.push(item);
      }
    });

    totalProcessed++;
    totalDuplicatesRemoved += duplicatesRemoved;

    const basename = path.basename(filePath);

    if (duplicatesRemoved > 0) {
      console.log(
        `${RED}• ${basename}${RESET} ` +
        `(${data.length} → ${cleaned.length} entries) — ` +
        `${BOLD}${duplicatesRemoved} duplicates removed${RESET}`
      );
    } else {
      console.log(
        `${GREEN}• ${basename}${RESET} ` +
        `(${data.length} entries) — clean`
      );
    }

    if (dryRun) {
      return;
    }

    // Write the cleaned file
    const targetPath = outputPath || fullPath;
    try {
      fs.writeFileSync(targetPath, JSON.stringify(cleaned, null, 2), "utf-8");
    } catch (err: any) {
      console.error(`Error writing ${basename}: ${err.message}`);
    }
  });

  console.log(`\n${BOLD}PROCESS COMPLETE${RESET}`);
  console.log(`Files processed        : ${totalProcessed}`);
  console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);

  if (dryRun) {
    console.log(`\nDry run finished — no files were modified.`);
  } else if (totalDuplicatesRemoved > 0) {
    console.log(`\nAll affected files have been updated.`);
  } else {
    console.log(`\nNo duplicates were found.`);
  }
}

main();