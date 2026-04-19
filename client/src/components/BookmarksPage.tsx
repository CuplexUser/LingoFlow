import { useEffect, useMemo, useRef, useState } from "react";
import type { Bookmark } from "../api";

type BookmarksPageProps = {
  bookmarks: Bookmark[];
  loading: boolean;
  errorMessage: string;
  activeLanguageLabel: string;
  onRemoveBookmark: (questionId: string) => void | Promise<void>;
};

function formatBookmarkDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return date.toLocaleString();
}

function resolveSpeechLang(language: string): string {
  const key = String(language || "").trim().toLowerCase();
  if (key === "spanish") return "es-ES";
  if (key === "english") return "en-US";
  if (key === "italian") return "it-IT";
  if (key === "swedish") return "sv-SE";
  if (key === "russian") return "ru-RU";
  if (key === "french") return "fr-FR";
  if (key === "german") return "de-DE";
  if (key === "portuguese") return "pt-PT";
  return "en-US";
}

export function BookmarksPage({
  bookmarks,
  loading,
  errorMessage,
  activeLanguageLabel,
  onRemoveBookmark
}: BookmarksPageProps) {
  const [speakingQuestionId, setSpeakingQuestionId] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [speechRate, setSpeechRate] = useState("1");
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof window.SpeechSynthesisUtterance !== "undefined",
    []
  );

  useEffect(() => {
    return () => {
      if (!speechSupported || typeof window === "undefined") return;
      window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  useEffect(() => {
    if (!speakingQuestionId || bookmarks.some((bookmark) => bookmark.questionId === speakingQuestionId)) {
      return;
    }
    if (speechSupported && typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    activeUtteranceRef.current = null;
    setSpeakingQuestionId("");
  }, [bookmarks, speakingQuestionId, speechSupported]);

  function stopSpeech() {
    if (!speechSupported || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
    setSpeakingQuestionId("");
  }

  function listenToBookmark(bookmark: Bookmark) {
    if (!speechSupported || typeof window === "undefined") {
      setSpeechError("Listen is not supported in this browser.");
      return;
    }
    const answer = String(bookmark.answer || "").trim();
    if (!answer) return;

    setSpeechError("");
    if (speakingQuestionId === bookmark.questionId) {
      stopSpeech();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(answer);
    utterance.lang = resolveSpeechLang(bookmark.language);
    utterance.rate = Number(speechRate) || 1;
    utterance.onend = () => {
      if (activeUtteranceRef.current !== utterance) return;
      activeUtteranceRef.current = null;
      setSpeakingQuestionId("");
    };
    utterance.onerror = () => {
      if (activeUtteranceRef.current !== utterance) return;
      activeUtteranceRef.current = null;
      setSpeakingQuestionId("");
      setSpeechError("Could not play audio for this bookmark.");
    };
    activeUtteranceRef.current = utterance;
    setSpeakingQuestionId(bookmark.questionId);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section className="panel bookmarks-panel">
      <div className="bookmarks-header">
        <div>
          <p className="eyebrow">Bookmarks</p>
          <h2>Saved For Review</h2>
        </div>
        <div className="bookmarks-header-right">
          <label className="theme-switcher bookmarks-speed">
            Speed
            <select
              value={speechRate}
              onChange={(event) => setSpeechRate(event.target.value)}
              aria-label="Bookmark playback speed"
            >
              <option value="0.85">0.85x</option>
              <option value="1">1.0x</option>
              <option value="1.15">1.15x</option>
            </select>
          </label>
          <span className="bookmarks-count">
            {bookmarks.length} in {activeLanguageLabel}
          </span>
        </div>
      </div>

      {loading ? <p>Loading bookmarks...</p> : null}
      {!loading && errorMessage ? <div className="status">{errorMessage}</div> : null}
      {!loading && !errorMessage && speechError ? <div className="status">{speechError}</div> : null}
      {!loading && !errorMessage && !bookmarks.length ? (
        <p>No bookmarks yet. Save items during a session to review them later.</p>
      ) : null}

      {!loading && !errorMessage && bookmarks.length ? (
        <div className="bookmarks-list">
          {bookmarks.map((bookmark) => (
            <article key={bookmark.questionId} className="bookmarks-item">
              <div className="bookmarks-item-meta">
                <span>{bookmark.category}</span>
                <span>{formatBookmarkDate(bookmark.createdAt)}</span>
              </div>
              <p className="bookmarks-prompt">{bookmark.prompt}</p>
              <div className="bookmarks-answer-row">
                <p className="bookmarks-answer">{bookmark.answer}</p>
                <button
                  className="ghost-button bookmarks-listen-button"
                  type="button"
                  onClick={() => listenToBookmark(bookmark)}
                  disabled={!speechSupported || !String(bookmark.answer || "").trim()}
                  aria-label={speakingQuestionId === bookmark.questionId ? "Stop bookmark audio" : "Listen to bookmark answer"}
                >
                  {speakingQuestionId === bookmark.questionId ? "Stop" : "Listen"}
                </button>
              </div>
              <div className="bookmarks-item-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onRemoveBookmark(bookmark.questionId)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
