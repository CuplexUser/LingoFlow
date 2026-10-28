import { describe, it, expect } from "vitest";
import { isSpokenAnswerMatch } from "../components/session/sessionHelpers";

describe("isSpokenAnswerMatch", () => {
  const long = ["Me gusta mucho leer libros.", "Me gusta mucho leer libros"];

  it("allows one wrong, missing or extra word in sentences of four words or more", () => {
    expect(isSpokenAnswerMatch(long, "Me gusta mucho leer libros")).toBe(true);
    expect(isSpokenAnswerMatch(long, "me gusta mucho leer libro")).toBe(true);
    expect(isSpokenAnswerMatch(long, "me gusta mucho comer libros")).toBe(true);
    expect(isSpokenAnswerMatch(long, "me gusta leer libros")).toBe(true);
    expect(isSpokenAnswerMatch(long, "me gusta mucho mucho leer libros")).toBe(true);
  });

  it("rejects two differing words, even when each is close", () => {
    expect(isSpokenAnswerMatch(long, "me gusta mucho comer pan")).toBe(false);
    expect(isSpokenAnswerMatch(long, "gusta leer libros")).toBe(false);
    expect(isSpokenAnswerMatch(long, "me gusta mucho leeer libro")).toBe(false);
  });

  it("only allows a near miss in short answers", () => {
    expect(isSpokenAnswerMatch(["Muchas gracias."], "muchas gracia")).toBe(true);
    expect(isSpokenAnswerMatch(["Muchas gracias."], "muchas noches")).toBe(false);
    expect(isSpokenAnswerMatch(["Muchas gracias."], "gracias")).toBe(false);
    expect(isSpokenAnswerMatch(["Gracias."], "gracia")).toBe(true);
    expect(isSpokenAnswerMatch(["Gracias."], "hola")).toBe(false);
  });

  it("accepts any listed variant and ignores spacing differences", () => {
    expect(isSpokenAnswerMatch(["Я забыл ключи.", "Я забыла ключи."], "я забыла ключи")).toBe(true);
    expect(isSpokenAnswerMatch(["Gracias."], "gra cias")).toBe(true);
  });

  it("rejects an empty transcript", () => {
    expect(isSpokenAnswerMatch(["Gracias."], "")).toBe(false);
    expect(isSpokenAnswerMatch(["Gracias."], null)).toBe(false);
  });
});
