import { useCallback, useEffect, useRef, useState } from "react";

type UseStoryPlaybackParams = {
  sentences: string[];
  lang: string;
  rate: number;
  enabled: boolean;
  // Stops playback whenever this key changes (story switch, language, or rate change).
  resetKey: string;
};

// Owns continuous "Play story" narration plus the karaoke highlight. Sentences are
// chained via SpeechSynthesisUtterance.onend (more reliable cross-browser than
// queueing every utterance up front) and the active sentence index is exposed so
// the reader can highlight it. Latest sentences/lang/rate are read from a ref so the
// play/speak callbacks stay stable and don't restart on every render.
export function useStoryPlayback({ sentences, lang, rate, enabled, resetKey }: UseStoryPlaybackParams) {
  const [playing, setPlaying] = useState(false);
  const [currentSentence, setCurrentSentence] = useState<number | null>(null);
  const playingRef = useRef(false);
  const keepAliveRef = useRef<number | null>(null);
  const dataRef = useRef({ sentences, lang, rate, enabled });

  // Keep the latest inputs available to the stable play/speak callbacks without
  // forcing them to re-create (which would interrupt an in-flight narration).
  useEffect(() => {
    dataRef.current = { sentences, lang, rate, enabled };
  }, [sentences, lang, rate, enabled]);

  const cancel = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    playingRef.current = false;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* best effort */
    }
    if (keepAliveRef.current !== null) {
      window.clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cancel();
    setPlaying(false);
    setCurrentSentence(null);
  }, [cancel]);

  // Speak a single tapped word or sentence. Interrupts any running narration.
  const speakText = useCallback(
    (text: string) => {
      const { lang: curLang, rate: curRate, enabled: curEnabled } = dataRef.current;
      if (!curEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
      cancel();
      setPlaying(false);
      setCurrentSentence(null);
      try {
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.lang = curLang;
        utterance.rate = curRate;
        window.speechSynthesis.speak(utterance);
      } catch {
        /* best effort */
      }
    },
    [cancel]
  );

  // Read the whole story aloud from `fromIndex`, highlighting each sentence in turn.
  const playAll = useCallback(
    (fromIndex = 0) => {
      const { sentences: list, lang: curLang, rate: curRate, enabled: curEnabled } = dataRef.current;
      if (!curEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
      if (!list.length) return;
      cancel();
      playingRef.current = true;
      setPlaying(true);

      // Chrome silently halts long synthesis runs; a periodic resume keeps it going.
      keepAliveRef.current = window.setInterval(() => {
        if (!playingRef.current) return;
        try {
          window.speechSynthesis.resume();
        } catch {
          /* best effort */
        }
      }, 10000);

      const speakAt = (index: number) => {
        if (!playingRef.current) return;
        if (index >= list.length) {
          stop();
          return;
        }
        setCurrentSentence(index);
        const utterance = new window.SpeechSynthesisUtterance(list[index]);
        utterance.lang = curLang;
        utterance.rate = curRate;
        utterance.onend = () => {
          if (playingRef.current) speakAt(index + 1);
        };
        utterance.onerror = () => {
          if (playingRef.current) speakAt(index + 1);
        };
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          stop();
        }
      };

      speakAt(Math.max(0, fromIndex));
    },
    [cancel, stop]
  );

  // Cancel any speech on unmount.
  useEffect(() => () => cancel(), [cancel]);

  // Reset playback when the story, language, or rate changes.
  useEffect(() => {
    stop();
  }, [resetKey, stop]);

  return { playing, currentSentence, playAll, stop, speakText };
}
