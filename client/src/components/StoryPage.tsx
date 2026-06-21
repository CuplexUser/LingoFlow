import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { CourseContext } from "../context/CourseContext";
import { tokenHasLetter, tokenizeSentence } from "./session/sessionHelpers";
import { useStoryPlayback } from "./story/useStoryPlayback";
import { StoryQuiz } from "./story/StoryQuiz";
import type {
  Story,
  StoryCompletionResult,
  StoryGlossEntry,
  StorySummary
} from "../types/story";

type StoryPageProps = {
  language: string;
  languageLabel: string;
};

type ReaderStep = "reading" | "quiz" | "complete";

const LEVEL_SEQUENCE = ["a1", "a2", "b1", "b2"];

// First unread story in a list, falling back to the first story so a level tab
// always resolves to something selectable.
function firstUnreadId(list: StorySummary[]): string {
  const unread = list.find((summary) => !summary.completed);
  return (unread ?? list[0])?.id ?? "";
}

// Next unread story across the whole library (lowest level first), used as a fallback
// for the "Read next" affordance when the server recommendation is unavailable.
function nextUnreadStory(list: StorySummary[], currentId: string): StorySummary | null {
  const ordered = [...list].sort(
    (a, b) => LEVEL_SEQUENCE.indexOf(a.level) - LEVEL_SEQUENCE.indexOf(b.level)
  );
  return ordered.find((summary) => !summary.completed && summary.id !== currentId) ?? null;
}

type DrawerEntry = {
  word: string;
  gloss: string;
  pos: string;
  note?: string;
  tier: "curated" | "resolved";
};

function resolveSpeechLang(language: string): string {
  const key = String(language || "").trim().toLowerCase();
  if (key === "spanish") return "es-ES";
  if (key === "english") return "en-US";
  if (key === "italian") return "it-IT";
  if (key === "swedish") return "sv-SE";
  if (key === "russian") return "ru-RU";
  if (key === "french") return "fr-FR";
  if (key === "german") return "de-DE";
  return "en-US";
}

function Icon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 16,
    height: 16,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };
  if (name === "speak") return <svg {...common}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" /></svg>;
  if (name === "close") return <svg {...common}><path d="M5 5l14 14M19 5L5 19" /></svg>;
  if (name === "bookmark") return <svg {...common}><path d="M6 4h12v16l-6-4-6 4z" /></svg>;
  if (name === "check") return <svg {...common}><path d="M4 12l5 5L20 6" /></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "reset") return <svg {...common}><path d="M4 4v6h6M20 12a8 8 0 1 1-2.3-5.6L20 8" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;
  if (name === "play") return <svg {...common}><path d="M7 5l12 7-12 7z" /></svg>;
  if (name === "stop") return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>;
  return null;
}

export function StoryPage({ language, languageLabel }: StoryPageProps) {
  // Read the shared TTS rate from course context when available; the Story Reader is
  // also rendered standalone in tests, so fall back to the default rate gracefully.
  const course = useContext(CourseContext);
  const speechRate = course?.settings?.speechRate ?? 0.92;

  const [stories, setStories] = useState<StorySummary[]>([]);
  const [storiesError, setStoriesError] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [story, setStory] = useState<Story | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [resolvedGlosses, setResolvedGlosses] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [lookedUp, setLookedUp] = useState<Set<string>>(() => new Set());
  const [showEn, setShowEn] = useState(false);
  const [step, setStep] = useState<ReaderStep>("reading");
  const [result, setResult] = useState<StoryCompletionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [ttsSupported] = useState(() => typeof window !== "undefined" && !!window.speechSynthesis);
  const speechLang = resolveSpeechLang(language);

  const sentenceRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const maxSeenRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const resumeIndexRef = useRef(0);

  const tokenizedSentences = useMemo(() => story?.sentences.map((s) => s.target) ?? [], [story]);
  const playback = useStoryPlayback({
    sentences: tokenizedSentences,
    lang: speechLang,
    rate: speechRate,
    enabled: ttsSupported,
    resetKey: `${story?.id ?? ""}:${speechLang}:${speechRate}`
  });
  const { currentSentence } = playback;

  // Load the story list for the active course language.
  useEffect(() => {
    let cancelled = false;
    setStoriesError("");
    setStory(null);
    setSelectedId("");
    api
      .getStories({ language })
      .then((list) => {
        if (cancelled) return;
        setStories(list);
        // Default to the lowest level that still has an unread story (progressive).
        const present = LEVEL_SEQUENCE.filter((lvl) => list.some((s) => s.level === lvl));
        const level =
          present.find((lvl) => list.some((s) => s.level === lvl && !s.completed)) ??
          present[0] ??
          "";
        setSelectedLevel(level);
        setSelectedId(firstUnreadId(list.filter((s) => s.level === level)));
      })
      .catch(() => {
        if (cancelled) return;
        setStories([]);
        setStoriesError("Could not load stories. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Initialize the saved set from the learner's persisted saved words.
  useEffect(() => {
    let cancelled = false;
    api
      .getSavedWords(language)
      .then((words) => {
        if (cancelled) return;
        setSaved(new Set(words.map((entry) => entry.word.toLowerCase())));
      })
      .catch(() => {
        /* non-fatal: drawer can still save */
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Load the selected story and pre-fetch glosses for words not in the curated glossary.
  useEffect(() => {
    if (!selectedId) {
      setStory(null);
      return;
    }
    let cancelled = false;
    setStoryLoading(true);
    setActive(null);
    setShowEn(false);
    setStep("reading");
    setResult(null);
    setLookedUp(new Set());
    setResolvedGlosses({});
    // Remember where the learner left off so we can resume after the story renders.
    resumeIndexRef.current = stories.find((s) => s.id === selectedId)?.lastSentenceIndex ?? 0;
    maxSeenRef.current = resumeIndexRef.current;
    api
      .getStory(selectedId)
      .then((full) => {
        if (cancelled) return;
        setStory(full);
        const uncovered = new Set<string>();
        for (const sentence of full.sentences) {
          for (const token of tokenizeSentence(sentence.target)) {
            const key = token.core.toLowerCase();
            if (key && tokenHasLetter(key) && !full.glossary[key]) uncovered.add(key);
          }
        }
        if (uncovered.size) {
          api
            .fetchWordTranslations(full.language, [...uncovered])
            .then((translations) => {
              if (!cancelled) setResolvedGlosses(translations);
            })
            .catch(() => {
              /* curated glossary still works without the dictionary fallback */
            });
        }
      })
      .catch(() => {
        if (!cancelled) setStory(null);
      })
      .finally(() => {
        if (!cancelled) setStoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const entryFor = useCallback(
    (key: string): DrawerEntry | null => {
      if (!story) return null;
      const curated: StoryGlossEntry | undefined = story.glossary[key];
      if (curated) {
        return { word: key, gloss: curated.g, pos: curated.pos, note: curated.note, tier: "curated" };
      }
      const resolved = resolvedGlosses[key];
      if (resolved) {
        return { word: key, gloss: resolved, pos: "", tier: "resolved" };
      }
      return null;
    },
    [story, resolvedGlosses]
  );

  const tokenized = useMemo(() => {
    if (!story) return [];
    return story.sentences.map((sentence) => ({
      en: sentence.en,
      target: sentence.target,
      brk: Boolean(sentence.break),
      tokens: tokenizeSentence(sentence.target).map((token) => {
        const interactive = tokenHasLetter(token.core);
        const key = interactive ? token.core.toLowerCase() : "";
        return { ...token, key, entry: key ? entryFor(key) : null };
      })
    }));
  }, [story, entryFor]);

  // Scroll to the resume point once the story has rendered.
  useEffect(() => {
    if (!story || step !== "reading") return;
    const idx = resumeIndexRef.current;
    if (idx <= 0) return;
    const el = sentenceRefs.current[idx];
    if (el) {
      window.setTimeout(() => el.scrollIntoView({ block: "center" }), 60);
    }
  }, [story, step]);

  // Track the furthest sentence the learner has reached and persist it (debounced),
  // so reopening the story resumes where they left off.
  useEffect(() => {
    if (!story || step !== "reading") return;
    const els = sentenceRefs.current.filter(Boolean) as HTMLParagraphElement[];
    if (typeof IntersectionObserver === "undefined" || !els.length) return;
    const storyId = story.id;
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index || 0);
          if (idx > maxSeenRef.current) {
            maxSeenRef.current = idx;
            changed = true;
          }
        }
        if (!changed) return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          api.saveStoryProgress(storyId, maxSeenRef.current).catch(() => {});
        }, 1200);
      },
      { threshold: 0.5 }
    );
    els.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [story, step, tokenized]);

  // Keep the sentence being narrated in view.
  useEffect(() => {
    if (currentSentence == null) return;
    const el = sentenceRefs.current[currentSentence];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentSentence]);

  const onTapWord = useCallback((key: string) => {
    setActive(key);
    setLookedUp((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Escape closes the drawer.
  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);

  const activeEntry = active ? entryFor(active) : null;

  async function toggleSave(key: string) {
    if (!story) return;
    const isSaved = saved.has(key);
    setSaved((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      if (isSaved) {
        await api.removeSavedWord(key, story.language);
      } else {
        const entry = entryFor(key);
        await api.saveWord({
          language: story.language,
          word: key,
          translation: entry?.gloss ?? "",
          storyId: story.id,
          category: story.category
        });
      }
    } catch {
      // Roll back on failure so the UI reflects the server state.
      setSaved((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  const availableLevels = useMemo(() => {
    const present = new Set(stories.map((summary) => summary.level));
    return LEVEL_SEQUENCE.filter((level) => present.has(level as StorySummary["level"]));
  }, [stories]);

  const storiesInLevel = useMemo(
    () => stories.filter((summary) => summary.level === selectedLevel),
    [stories, selectedLevel]
  );

  const readNext = useMemo(() => nextUnreadStory(stories, selectedId), [stories, selectedId]);

  function selectLevel(level: string) {
    setSelectedLevel(level);
    setSelectedId(firstUnreadId(stories.filter((summary) => summary.level === level)));
  }

  function selectStory(summary: StorySummary) {
    playback.stop();
    setSelectedLevel(summary.level);
    setSelectedId(summary.id);
    setStep("reading");
    setResult(null);
  }

  // Sends the (optionally empty) answer set to the server, which scores the quiz and
  // awards XP. Updates the library row but leaves the step transition to the caller.
  async function submitCompletion(answers: number[]): Promise<StoryCompletionResult | null> {
    if (!story) return null;
    const id = story.id;
    setSubmitting(true);
    // Optimistically flag the story complete; scoring/XP come from the response.
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, completed: true } : s)));
    try {
      const res = await api.completeStory(id, answers);
      setResult(res);
      setStories((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, completed: true, quizScore: res.quizScore, quizTotal: res.quizTotal } : s
        )
      );
      return res;
    } catch {
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    if (!story) return;
    playback.stop();
    if (story.questions && story.questions.length > 0) {
      setStep("quiz");
      return;
    }
    await submitCompletion([]);
    setStep("complete");
  }

  const savedList = [...saved];
  const finished = step === "complete";

  return (
    <section className="panel">
      <div className="sr">
        <div className="sr-topbar">
          <div>
            <p className="eyebrow">Read · {languageLabel}</p>
            <h2>Story Reader</h2>
          </div>
          {availableLevels.length > 0 && (
            <div className="sr-levels" role="group" aria-label="Reading level">
              {availableLevels.map((level) => (
                <button
                  key={level}
                  type="button"
                  className="sr-level"
                  aria-pressed={selectedLevel === level}
                  onClick={() => selectLevel(level)}
                >
                  {level.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {storiesInLevel.length > 0 && (
          <ul className="sr-library" aria-label="Stories in this level">
            {storiesInLevel.map((summary) => {
              const progress = summary.sentenceCount
                ? Math.min(1, (summary.lastSentenceIndex ?? 0) / summary.sentenceCount)
                : 0;
              const inProgress = !summary.completed && progress > 0;
              return (
                <li key={summary.id}>
                  <button
                    type="button"
                    className={`sr-lib-item ${summary.id === selectedId ? "active" : ""} ${
                      summary.completed ? "done" : ""
                    }`}
                    aria-pressed={summary.id === selectedId}
                    onClick={() => selectStory(summary)}
                  >
                    <span className="sr-lib-title">{summary.title}</span>
                    <span className="sr-lib-sub">{summary.titleEn}</span>
                    <span className="sr-lib-tags">
                      {summary.hasQuiz ? <span className="sr-lib-tag">Quiz</span> : null}
                      {summary.completed ? (
                        <span className="sr-lib-check" aria-label="Completed">
                          <Icon name="check" />
                        </span>
                      ) : null}
                    </span>
                    {inProgress ? (
                      <span className="sr-lib-progress" aria-hidden>
                        <span style={{ width: `${Math.round(progress * 100)}%` }} />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {storiesError ? <div className="status">{storiesError}</div> : null}
        {!storiesError && !stories.length ? (
          <p className="sr-empty">No stories yet for {languageLabel}. Check back soon.</p>
        ) : null}
        {storyLoading ? <p className="sr-empty">Loading story…</p> : null}

        {story && !storyLoading ? (
          <>
            <header className="sr-head">
              <p className="sr-eyebrow">
                {story.level.toUpperCase()} <span className="sr-dot" /> {story.theme}
              </p>
              <h1 className="sr-title">{story.title}</h1>
              <p className="sr-subtitle">{story.titleEn}</p>
            </header>

            {step === "quiz" && story.questions ? (
              <StoryQuiz
                questions={story.questions}
                result={result}
                submitting={submitting}
                onSubmit={(answers) => submitCompletion(answers)}
                onContinue={() => setStep("complete")}
              />
            ) : (
              <>
                <div className="sr-story">
                  {tokenized.map((sentence, sentenceIndex) => (
                    <p
                      className={`sr-sent${sentence.brk ? " sr-break" : ""}${
                        sentenceIndex === currentSentence ? " playing" : ""
                      }`}
                      key={sentenceIndex}
                      data-index={sentenceIndex}
                      aria-current={sentenceIndex === currentSentence ? "true" : undefined}
                      ref={(el) => {
                        sentenceRefs.current[sentenceIndex] = el;
                      }}
                    >
                      {sentence.tokens.map((token, tokenIndex) => {
                        const trailingSpace = tokenIndex < sentence.tokens.length - 1 ? " " : "";
                        if (!token.entry || !token.key) {
                          return (
                            <Fragment key={tokenIndex}>
                              {token.lead}
                              {token.core}
                              {token.trail}
                              {trailingSpace}
                            </Fragment>
                          );
                        }
                        const className = [
                          "sr-word",
                          token.entry.tier === "curated" ? (token.entry.note ? "grammar" : "gloss") : "",
                          saved.has(token.key) ? "saved" : "",
                          token.key === active ? "active" : ""
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <Fragment key={tokenIndex}>
                            {token.lead}
                            <button
                              type="button"
                              className={className}
                              aria-label={`${token.core} — ${token.entry.gloss}`}
                              onClick={() => onTapWord(token.key)}
                            >
                              {token.core}
                            </button>
                            {token.trail}
                            {trailingSpace}
                          </Fragment>
                        );
                      })}
                      <button
                        type="button"
                        className="sr-spk"
                        aria-label="Listen to this sentence"
                        onClick={() => playback.speakText(sentence.target)}
                        disabled={!ttsSupported}
                      >
                        <Icon name="speak" />
                      </button>
                      {showEn ? <span className="sr-sent-en">{sentence.en}</span> : null}
                    </p>
                  ))}
                </div>

                <aside className="sr-note">
                  <div className="sr-note-label">Cultural note</div>
                  <p className="sr-note-term">{story.culturalNote.term}</p>
                  <p className="sr-note-body">{story.culturalNote.body}</p>
                </aside>
              </>
            )}
          </>
        ) : null}
      </div>

      {/* word lookup drawer */}
      <div className="sr-drawer-wrap" aria-live="polite">
        <div className={`sr-drawer ${active && activeEntry ? "open" : ""}`} role="dialog" aria-label="Word lookup">
          {activeEntry ? (
            <>
              <div className="sr-drawer-top">
                <div className="sr-drawer-word">
                  {active}
                  <button
                    type="button"
                    className="sr-icon-btn"
                    aria-label="Listen"
                    onClick={() => active && playback.speakText(active)}
                    disabled={!ttsSupported}
                  >
                    <Icon name="speak" />
                  </button>
                </div>
                <button type="button" className="sr-icon-btn" aria-label="Close" onClick={() => setActive(null)}>
                  <Icon name="close" />
                </button>
              </div>
              <p className="sr-drawer-gloss">{activeEntry.gloss}</p>
              {activeEntry.pos ? <p className="sr-drawer-pos">{activeEntry.pos}</p> : null}
              {activeEntry.note ? <div className="sr-drawer-grammar">{activeEntry.note}</div> : null}
              <div className="sr-drawer-actions">
                <button
                  type="button"
                  className={`sr-action ${active && saved.has(active) ? "saved" : "primary"}`}
                  onClick={() => active && toggleSave(active)}
                >
                  {active && saved.has(active) ? (
                    <>
                      <Icon name="check" /> Saved to review
                    </>
                  ) : (
                    <>
                      <Icon name="bookmark" /> Save to review
                    </>
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {story && !storyLoading && step === "reading" ? (
        <div className="sr-footer">
          <div className="sr-footer-inner">
            <div className="sr-footer-controls">
              <button
                type="button"
                className="sr-text-btn"
                onClick={() => (playback.playing ? playback.stop() : playback.playAll(0))}
                disabled={!ttsSupported}
              >
                <Icon name={playback.playing ? "stop" : "play"} />
                {playback.playing ? "Stop" : "Play story"}
              </button>
              <button
                type="button"
                className="sr-text-btn"
                aria-pressed={showEn}
                onClick={() => setShowEn((value) => !value)}
              >
                <Icon name={showEn ? "check" : "arrow"} />
                {showEn ? "Hide English" : "Show English"}
              </button>
            </div>
            <div className="sr-counts">
              <span>
                <b>{lookedUp.size}</b> looked up
              </span>
              <span className="sr-glow">
                <b>{saved.size}</b> saved
              </span>
            </div>
            <button type="button" className="sr-finish" onClick={handleFinish}>
              {story.questions && story.questions.length > 0 ? "Take the quiz" : "Finish story"}{" "}
              <Icon name="arrow" />
            </button>
          </div>
        </div>
      ) : null}

      {finished ? (
        <div className="sr-modal-scrim" onClick={() => setStep("reading")}>
          <div className="sr-modal" role="dialog" aria-label="Story complete" onClick={(event) => event.stopPropagation()}>
            <div className="sr-modal-spark">
              <Icon name="spark" />
            </div>
            <h3>Nicely read.</h3>
            {result && result.quizTotal ? (
              <p className="sr-modal-score">
                Quiz: <b>{result.quizScore}</b> / {result.quizTotal}
              </p>
            ) : null}
            {result && result.xpGained > 0 ? (
              <p className="sr-modal-xp">
                <Icon name="spark" /> +{result.xpGained} XP
              </p>
            ) : result && result.alreadyAwarded ? (
              <p className="sr-modal-xp muted">You already earned XP for this story.</p>
            ) : null}
            <p>
              {savedList.length > 0
                ? `${savedList.length} ${savedList.length === 1 ? "word goes" : "words go"} into your review queue. They'll resurface in upcoming practice sessions.`
                : "You didn't save any words this time. Tap any word while reading to send it to your review queue."}
            </p>
            <div className="sr-chiprow">
              {savedList.length > 0 ? (
                savedList.map((word) => (
                  <span className="sr-chip" key={word}>
                    {word}
                  </span>
                ))
              ) : (
                <span className="sr-chip none">No words saved yet</span>
              )}
            </div>
            <div className="sr-modal-actions">
              <button type="button" className="sr-action" onClick={() => setStep("reading")}>
                <Icon name="check" /> Done
              </button>
              {readNext ? (
                <button type="button" className="sr-action primary" onClick={() => selectStory(readNext)}>
                  Read next <Icon name="arrow" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
