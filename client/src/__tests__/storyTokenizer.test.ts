import { describe, it, expect } from "vitest";
import {
  splitWordToken,
  tokenizeSentence,
  tokenHasLetter
} from "../components/session/sessionHelpers";

describe("splitWordToken", () => {
  it("peels a leading guillemet off the word core", () => {
    expect(splitWordToken("«Сколько")).toEqual({ lead: "«", core: "Сколько", trail: "" });
  });

  it("peels trailing question mark and closing guillemet", () => {
    expect(splitWordToken("яблоки?»")).toEqual({ lead: "", core: "яблоки", trail: "?»" });
  });

  it("keeps an internal hyphen inside the core (наконец-то)", () => {
    expect(splitWordToken("наконец-то")).toEqual({ lead: "", core: "наконец-то", trail: "" });
  });

  it("leaves a standalone em dash as a coreless, letterless token", () => {
    const token = splitWordToken("—");
    expect(token.core).toBe("—");
    expect(tokenHasLetter(token.core)).toBe(false);
  });

  it("strips a trailing comma", () => {
    expect(splitWordToken("яблоки,")).toEqual({ lead: "", core: "яблоки", trail: "," });
  });

  it("handles a colon-trailed word (сказал:)", () => {
    expect(splitWordToken("сказал:")).toEqual({ lead: "", core: "сказал", trail: ":" });
  });
});

describe("tokenizeSentence", () => {
  it("tokenizes a quoted question with an em dash dialogue tag", () => {
    const tokens = tokenizeSentence("«Сколько стоят яблоки?» — спросила она.");
    const cores = tokens.map((token) => token.core);
    expect(cores).toEqual(["Сколько", "стоят", "яблоки", "—", "спросила", "она"]);

    const interactive = tokens.filter((token) => tokenHasLetter(token.core)).map((token) => token.core);
    expect(interactive).toEqual(["Сколько", "стоят", "яблоки", "спросила", "она"]);
    // The em dash carries no letters, so it is never a lookup target.
    expect(tokens.find((token) => token.core === "—")?.core).toBe("—");
  });

  it("preserves the hyphenated compound as a single interactive token", () => {
    const tokens = tokenizeSentence("Я наконец-то приехал.");
    expect(tokens.map((token) => token.core)).toEqual(["Я", "наконец-то", "приехал"]);
  });
});
