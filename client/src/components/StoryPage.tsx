import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { tokenHasLetter, tokenizeSentence } from "./session/sessionHelpers";
import type { Story, StoryGlossEntry, StorySummary } from "../types/story";

type StoryPageProps = {
  language: string;
  languageLabel: string;
};

const LEVEL_SEQUENCE = ["a1", "a2", "b1", "b2"];

// First unread story in a list, falling back to the first story so a level tab
// always resolves to something selectable.
function firstUnreadId(list: StorySummary[]): string {
  const unread = list.find((summary) => !summary.completed);
  return (unread ?? list[0])?.id ?? "";
}

// Next unread story across the whole library (lowest level first), used to power
// the "Read next" affordance after finishing a story.
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

function speak(text: string, lang: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* speech is best-effort */
  }
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
  return null;
}

export function StoryPage({ language, languageLabel }: StoryPageProps) {
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
  const [finished, setFinished] = useState(false);

  const [ttsSupported] = useState(() => typeof window !== "undefined" && !!window.speechSynthesis);
  const speechLang = resolveSpeechLang(language);

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

  // Initialise the saved set from the learner's persisted saved words.
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
    setFinished(false);
    setLookedUp(new Set());
    setResolvedGlosses({});
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
    setSelectedLevel(summary.level);
    setSelectedId(summary.id);
    setFinished(false);
  }

  async function handleFinish() {
    setFinished(true);
    if (!story) return;
    const id = story.id;
    // Optimistically mark the story complete; completion is best-effort.
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, completed: true } : s)));
    try {
      await api.completeStory(id);
    } catch {
      /* the modal still shows; completion will retry on the next finish */
    }
  }

  const savedList = [...saved];

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
            {storiesInLevel.map((summary) => (
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
                  {summary.completed ? (
                    <span className="sr-lib-check" aria-label="Completed">
                      <Icon name="check" />
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
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

            <div className="sr-story">
              {tokenized.map((sentence, sentenceIndex) => (
                <p className={`sr-sent${sentence.brk ? " sr-break" : ""}`} key={sentenceIndex}>
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
                    onClick={() => speak(sentence.target, speechLang)}
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

            <div className="sr-tools">
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
                    onClick={() => active && speak(active, speechLang)}
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

      {story && !storyLoading ? (
        <div className="sr-footer">
          <div className="sr-footer-inner">
            <div className="sr-counts">
              <span>
                <b>{lookedUp.size}</b> looked up
              </span>
              <span className="sr-glow">
                <b>{saved.size}</b> saved
              </span>
            </div>
            <button type="button" className="sr-finish" onClick={handleFinish}>
              Finish story <Icon name="arrow" />
            </button>
          </div>
        </div>
      ) : null}

      {finished ? (
        <div className="sr-modal-scrim" onClick={() => setFinished(false)}>
          <div className="sr-modal" role="dialog" aria-label="Story complete" onClick={(event) => event.stopPropagation()}>
            <div className="sr-modal-spark">
              <Icon name="spark" />
            </div>
            <h3>Nicely read.</h3>
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
              <button type="button" className="sr-action" onClick={() => setFinished(false)}>
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
