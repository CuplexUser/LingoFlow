import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSessionSpeech } from "../components/session/useSessionSpeech";

type FakeVoice = { name: string; lang: string };
type FakeUtterance = {
  text: string;
  lang?: string;
  voice?: FakeVoice;
  onerror?: (event: { error: string }) => void;
};

const VOICES: FakeVoice[] = [
  { name: "English", lang: "en-US" },
  { name: "Russian online", lang: "ru-RU" },
  { name: "Russian local", lang: "ru_RU" },
  { name: "Spanish (Mexico)", lang: "es-MX" },
  { name: "Spanish (Spain)", lang: "es-ES" }
];

describe("useSessionSpeech speakText", () => {
  let speak: ReturnType<typeof vi.fn>;
  let voices: FakeVoice[];
  const synth = window.speechSynthesis;
  const originalSpeak = synth.speak;
  const originalGetVoices = synth.getVoices;

  beforeEach(() => {
    voices = VOICES;
    speak = vi.fn();
    synth.speak = speak as unknown as SpeechSynthesis["speak"];
    synth.getVoices = (() => voices) as unknown as SpeechSynthesis["getVoices"];
  });

  afterEach(() => {
    synth.speak = originalSpeak;
    synth.getVoices = originalGetVoices;
  });

  function renderSpeech(language: string) {
    return renderHook(() => useSessionSpeech({ language, onTranscriptCaptured: () => {} }));
  }

  function spokenVoices() {
    return speak.mock.calls.map(([utterance]) => (utterance as FakeUtterance).voice?.name);
  }

  it("speaks with the first voice for the language, exact region first", () => {
    const { result } = renderSpeech("spanish");
    act(() => result.current.speakText("Hola / Adiós", 0.75));

    expect(speak).toHaveBeenCalledTimes(1);
    const utterance = speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe("Hola, Adiós");
    expect(utterance.lang).toBe("es-ES");
    expect(utterance.voice?.name).toBe("Spanish (Spain)");
    expect(result.current.speechError).toBe("");
  });

  it("tries the next voice for the language when one fails", () => {
    speak.mockImplementationOnce((utterance: FakeUtterance) => utterance.onerror?.({ error: "synthesis-failed" }));
    const { result } = renderSpeech("russian");
    act(() => result.current.speakText("Привет"));

    expect(spokenVoices()).toEqual(["Russian online", "Russian local"]);
    expect(result.current.speechError).toBe("");
  });

  it("names the error when every voice fails", () => {
    speak.mockImplementation((utterance: FakeUtterance) => utterance.onerror?.({ error: "synthesis-failed" }));
    const { result } = renderSpeech("russian");
    act(() => result.current.speakText("Привет"));

    expect(spokenVoices()).toEqual(["Russian online", "Russian local"]);
    expect(result.current.speechError).toBe("Could not play this audio hint (synthesis-failed).");
  });

  it("explains how to add a voice when the browser has none for the language", () => {
    voices = [{ name: "English", lang: "en-US" }];
    speak.mockImplementation((utterance: FakeUtterance) => utterance.onerror?.({ error: "language-unavailable" }));
    const { result } = renderSpeech("russian");
    act(() => result.current.speakText("Привет"));

    expect(speak).toHaveBeenCalledTimes(1);
    expect(result.current.speechError).toMatch(/^Your browser has no .+ voice\. Add one/);
  });

  it("ignores cancellations from interrupting a line", () => {
    speak.mockImplementation((utterance: FakeUtterance) => utterance.onerror?.({ error: "interrupted" }));
    const { result } = renderSpeech("russian");
    act(() => result.current.speakText("Привет"));

    expect(speak).toHaveBeenCalledTimes(1);
    expect(result.current.speechError).toBe("");
  });
});
