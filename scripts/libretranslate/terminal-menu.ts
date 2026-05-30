// Generic interactive terminal menu toolkit.
//
// This module knows nothing about translation or content — it only renders
// selection panels and notices, and turns keypresses into a PromptResult.
// Keep it free of any LibreTranslate / file-IO concerns.

import * as readline from "node:readline";

export interface Choice {
  label: string;
  // When set, the row is shown but cannot be selected (e.g. "exists"). The reason is
  // rendered next to the label.
  disabledReason?: string;
}

export interface ChooseManyOptions {
  initialCursor?: number;
  singleSelect?: boolean;
  selected?: Set<number>;
  allowBack?: boolean;
  subtitle?: string;
  // Index of a synthetic "select all" row. Toggling it selects every selectable row.
  selectAllIndex?: number;
}

export interface PromptResult<T> {
  action: "submit" | "back" | "cancel";
  selected: T[];
}

export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h"
};

export function color(text: string, code: string): string {
  return `${code}${text}${ANSI.reset}`;
}

function clearRenderedLines(count: number): void {
  for (let i = 0; i < count; i += 1) {
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
  }
}

function visibleLength(text: string): number {
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
  return text.replace(ansiPattern, "").length;
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - visibleLength(text)))}`;
}

function wrapPanelLine(line: string, width: number): string[] {
  if (visibleLength(line) <= width) return [line];

  const hasAnsi = line.includes(String.fromCharCode(27));
  if (hasAnsi) return [line];

  const words = line.split(" ");
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) wrapped.push(current);
  return wrapped.length ? wrapped : [line];
}

function makePanel(title: string, body: string[], footer: string[], width = 82): string[] {
  const top = `+${"-".repeat(width - 2)}+`;
  const titleText = ` ${color(title, ANSI.bold)} `;
  const titleLine = `|${padVisible(titleText, width - 2)}|`;
  const divider = `+${"-".repeat(width - 2)}+`;
  const rows = [...body, "", ...footer]
    .flatMap((line) => wrapPanelLine(line, width - 4))
    .map((line) => `| ${padVisible(line, width - 4)} |`);
  return [top, titleLine, divider, ...rows, top];
}

// Indexes a user can actually toggle/pick: everything except the "select all" row
// and any disabled row.
function selectableIndexesOf(choices: Choice[], selectAllIndex?: number): number[] {
  return choices
    .map((_, index) => index)
    .filter((index) => index !== selectAllIndex && !choices[index].disabledReason);
}

function renderSelectionPanel<T extends Choice>(
  title: string,
  choices: T[],
  cursor: number,
  selected: Set<number>,
  options: ChooseManyOptions
): string[] {
  const body: string[] = [];
  if (options.subtitle) {
    body.push(...options.subtitle.split("\n").map((line) => color(line, ANSI.dim)), "");
  }

  const selectableIndexes = selectableIndexesOf(choices, options.selectAllIndex);
  const selectableCount = selectableIndexes.length;
  const selectedCount = selectableIndexes.filter((index) => selected.has(index)).length;

  if (!options.singleSelect) {
    body.push(`${color("Selected", ANSI.cyan)} ${selectedCount}/${selectableCount}`);
    body.push("");
  }
  body.push("   Sel  Item");
  body.push("   ---  ------------------------------------------------------------");

  for (const [index, choice] of choices.entries()) {
    const isAllRow = options.selectAllIndex === index;
    const disabled = !isAllRow && Boolean(choice.disabledReason);
    const isSelected = isAllRow
      ? selectableCount > 0 && selectableIndexes.every((i) => selected.has(i))
      : selected.has(index);

    const pointer = index === cursor ? color(">", ANSI.green) : " ";
    const marker = disabled
      ? color("[-]", ANSI.dim)
      : isSelected
        ? color(options.singleSelect ? "(o)" : "[x]", ANSI.green)
        : options.singleSelect
          ? "( )"
          : "[ ]";

    const labelText = disabled ? `${choice.label} (${choice.disabledReason})` : choice.label;
    const label = disabled
      ? color(labelText, ANSI.dim)
      : index === cursor
        ? color(labelText, ANSI.bold)
        : labelText;
    body.push(` ${pointer} ${marker}  ${label}`);
  }

  const footer = [
    `${color("Keys", ANSI.cyan)} Up/Down move  ${
      options.singleSelect ? "Space mark" : "Space toggle"
    }  Enter continue`,
    `${options.allowBack ? "Backspace/B back  " : ""}Esc/Q cancel`
  ];

  return makePanel(title, body, footer);
}

export async function showNotice(
  title: string,
  lines: string[],
  allowBack: boolean
): Promise<"back" | "cancel"> {
  let renderedLines = 0;

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function render(): void {
    if (renderedLines > 0) clearRenderedLines(renderedLines);
    const panel = makePanel(title, lines, [`${allowBack ? "Backspace/B back  " : ""}Esc/Q cancel`]);
    process.stdout.write(`${panel.join("\n")}\n`);
    renderedLines = panel.length;
  }

  return new Promise((resolve) => {
    function done(action: "back" | "cancel"): void {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKeypress);
      if (renderedLines > 0) clearRenderedLines(renderedLines);
      resolve(action);
    }

    function onKeypress(_text: string, key: readline.Key): void {
      if ((key.ctrl && key.name === "c") || key.name === "escape" || key.name === "q") {
        done("cancel");
      } else if (
        allowBack &&
        (key.name === "backspace" || key.name === "b" || key.name === "return")
      ) {
        done("back");
      }
    }

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

export async function chooseMany<T extends Choice>(
  title: string,
  choices: T[],
  options: ChooseManyOptions = {}
): Promise<PromptResult<T>> {
  const selected = options.selected || new Set<number>();
  let cursor = options.initialCursor || 0;
  let renderedLines = 0;

  if (!choices.length) {
    throw new Error(`No choices available for ${title}`);
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  function render(): void {
    if (renderedLines > 0) clearRenderedLines(renderedLines);
    const lines = renderSelectionPanel(title, choices, cursor, selected, options);
    process.stdout.write(`${lines.join("\n")}\n`);
    renderedLines = lines.length;
  }

  return new Promise((resolve) => {
    function done(action: PromptResult<T>["action"]): void {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKeypress);
      if (renderedLines > 0) clearRenderedLines(renderedLines);
      const picked = choices.filter((_, index) => selected.has(index));
      resolve({ action, selected: picked });
    }

    function onKeypress(text: string, key: readline.Key): void {
      const isSpace = key.name === "space" || text === " " || key.sequence === " ";
      const isEnter = key.name === "return" || key.name === "enter" || key.sequence === "\r";
      const selectableIndexes = selectableIndexesOf(choices, options.selectAllIndex);
      const cursorDisabled =
        cursor !== options.selectAllIndex && Boolean(choices[cursor].disabledReason);

      if ((key.ctrl && key.name === "c") || key.name === "escape" || key.name === "q") {
        done("cancel");
        return;
      }
      if (options.allowBack && (key.name === "backspace" || key.name === "b")) {
        done("back");
        return;
      }

      if (key.name === "up") {
        cursor = (cursor - 1 + choices.length) % choices.length;
      } else if (key.name === "down") {
        cursor = (cursor + 1) % choices.length;
      } else if (isSpace) {
        // Space marks a selection but never advances — Enter is the only way forward.
        if (options.singleSelect) {
          if (!cursorDisabled) {
            selected.clear();
            selected.add(cursor);
          }
        } else if (cursor === options.selectAllIndex) {
          const allSelected =
            selectableIndexes.length > 0 && selectableIndexes.every((index) => selected.has(index));
          selected.clear();
          if (!allSelected) selectableIndexes.forEach((index) => selected.add(index));
        } else if (!cursorDisabled) {
          if (selected.has(cursor)) selected.delete(cursor);
          else selected.add(cursor);
        }
      } else if (isEnter) {
        if (options.singleSelect) {
          if (cursorDisabled) return;
          selected.clear();
          selected.add(cursor);
          done("submit");
          return;
        }
        if (selectableIndexes.some((index) => selected.has(index))) {
          done("submit");
          return;
        }
      }
      render();
    }

    process.stdin.on("keypress", onKeypress);
    render();
  });
}

export async function chooseOne<T extends Choice>(
  title: string,
  choices: T[],
  options: ChooseManyOptions = {}
): Promise<PromptResult<T>> {
  return chooseMany(title, choices, {
    initialCursor: 0,
    singleSelect: true,
    selected: new Set([0]),
    ...options
  });
}
