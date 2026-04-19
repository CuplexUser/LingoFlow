import { useEffect, useRef, useState } from "react";
import { getSpeechLanguage } from "./sessionHelpers";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  }
}

type UseSessionSpeechParams = {
  language: string;
  onTranscriptCaptured: (transcript: string) => void;
};

export function useSessionSpeech({
  language,
  onTranscriptCaptured
}: UseSessionSpeechParams) {
  const [speechError, setSpeechError] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioLoadingRef = useRef(false);

  const supportsSpeech = typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;
  const supportsRecognition = typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      if (supportsSpeech) {
        window.speechSynthesis.cancel();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [supportsSpeech]);

  async function playAudioUrl(url: string, playbackRate = 1) {
    if (typeof window === "undefined" || !window.AudioContext) {
      setSpeechError("Web Audio is not supported in this browser.");
      return;
    }
    if (audioLoadingRef.current) return;
    audioLoadingRef.current = true;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
      }
      const audioContext = audioContextRef.current;
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = Number.isFinite(playbackRate) ? playbackRate : 1;
      source.connect(audioContext.destination);
      source.start();
      setSpeechError("");
    } catch (_error) {
      setSpeechError("Could not play this audio clip.");
    } finally {
      audioLoadingRef.current = false;
    }
  }

  function speakText(text: string, rate = 0.95) {
    if (!supportsSpeech) {
      setSpeechError("Speech is not supported in this browser.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLanguage(language);
    utterance.rate = Number.isFinite(rate) ? rate : 0.95;
    utterance.onstart = () => setSpeechError("");
    utterance.onerror = (event) => {
      const code = (event as SpeechSynthesisErrorEvent)?.error;
      if (code === "canceled" || code === "interrupted") return;
      setSpeechError("Could not play this audio hint.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function startPronunciationCheck() {
    if (!supportsRecognition) {
      setSpeechError("Speech recognition is not supported in this browser.");
      return;
    }
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setSpeechError("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new RecognitionCtor();
    recognition.lang = getSpeechLanguage(language);
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      onTranscriptCaptured(transcript);
      setSpeechError("");
    };
    recognition.onerror = () => setSpeechError("Pronunciation capture failed.");
    recognition.start();
  }

  return {
    speechError,
    setSpeechError,
    supportsSpeech,
    supportsRecognition,
    playAudioUrl,
    speakText,
    startPronunciationCheck
  };
}
