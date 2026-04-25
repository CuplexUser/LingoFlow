#!/usr/bin/env npx tsx
/**
 * LingoFlow Duplicate Scanner (Per File)
 *
 * Scans each JSON language-learning file for duplicate "prompt" values
 * inside that file only. Completely read-only — does not modify any files.
 *
 * At the end it returns a clean list of only the files that contain duplicates
 * together with the exact number of duplicates in each file.
 *
 * Usage:
 *   npx tsx scripts/scan-duplicates-per-file.ts
 *   npx tsx scripts/scan-duplicates-per-file.ts conversation.json family_friends.json
 *   npx tsx scripts/scan-duplicates-per-file.ts server/content/languages/russian/*.json
 *
 * If no files are provided, the script automatically scans ALL *.json files
 * in the current working directory.
 *
 * Wildcards (*.json) are now fully supported (even on Windows).
 *
 * Assumptions about your file layout:
 *   All .json files are valid JSON arrays of exercise objects containing a "prompt" field.
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

function parseArgs(): string[] {
  const args = process.argv.slice(2);
  const files: string[] = [];

  for (const arg of args) {
    if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }
  return files;
}

/**
 * Simple glob expander for common patterns like folder/*.json
 * Works cross-platform (including Windows cmd/PowerShell).
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
          console.warn(`Warning: Could not expand pattern "${pattern}"`);
        }
      } else {
        // fallback for other wildcard patterns
        expanded.push(pattern);
      }
    } else {
      expanded.push(pattern);
    }
  }

  // remove any accidental duplicates from glob expansion
  return [...new Set(expanded)];
}

function main() {
  let files = parseArgs();

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
    console.log("No JSON files found to scan.");
    process.exit(0);
  }

  console.log(`Scanning ${files.length} JSON file(s) for internal duplicate prompts...\n`);

  const results: {
    file: string;
    totalEntries: number;
    duplicates: number;
  }[] = [];

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
    let duplicateCount = 0;

    data.forEach((item) => {
      const prompt = item.prompt?.toString().trim();
      if (!prompt) return;

      if (seen.has(prompt)) {
        duplicateCount++;
      } else {
        seen.add(prompt);
      }
    });

    results.push({
      file: path.basename(filePath),
      totalEntries: data.length,
      duplicates: duplicateCount,
    });
  });

  // Sort by number of duplicates (descending)
  const sortedResults = [...results].sort((a, b) => b.duplicates - a.duplicates);

  let filesWithDuplicates = 0;

  console.log(`${BOLD}FINAL SUMMARY — Files containing duplicates${RESET}\n`);

  sortedResults.forEach((result) => {
    if (result.duplicates > 0) {
      filesWithDuplicates++;
      console.log(
        `${RED}• ${result.file}${RESET} ` +
        `(${result.totalEntries} entries) — ` +
        `${BOLD}${result.duplicates} duplicates${RESET}`
      );
    }
  });

  // Clean files summary
  const cleanFiles = sortedResults.filter((r) => r.duplicates === 0);
  if (cleanFiles.length > 0) {
    console.log(`\n${GREEN}Clean files (0 duplicates):${RESET}`);
    cleanFiles.forEach((result) => {
      console.log(`  • ${result.file} (${result.totalEntries} entries)`);
    });
  }

  console.log(`\n${BOLD}SCAN COMPLETE${RESET}`);
  console.log(`Files with duplicates : ${filesWithDuplicates}`);
  console.log(`Total files scanned   : ${files.length}`);

  if (filesWithDuplicates === 0) {
    console.log(`\n${GREEN}All files are clean — no duplicates found.${RESET}`);
  } else {
    console.log(`\nNext step: Run deduplicate-prompts.ts on the files listed above.`);
  }
}

main();