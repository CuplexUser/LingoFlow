import { useEffect, useRef, useState } from "react";
import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload,
  WordCacheRebuildScope,
  WordPrefetchResult,
  WordTranslationCounts
} from "../api";
import { api, ApiError } from "../api";
import type { CourseCategory, LanguageOption } from "../types/course";
import type { ContributionModerationStatus } from "../types/contribution";
import { AdminUsersPanel } from "./AdminUsersPanel";
import { ContentStatsPage } from "./ContentStatsPage";
import { ContributionInbox } from "./ContributionInbox";

type AdminTab = "coverage" | "moderation" | "users" | "word-cache";

type Props = {
  canModerate: boolean;
  activeCourseLanguage: string;
  courseCategories: CourseCategory[];
  onLoadContributions: (params: {
    scope?: "mine" | "all";
    status?: ContributionModerationStatus | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => Promise<CommunityContributionListResponse>;
  onUpdateContributionStatus: (id: number, payload: CommunityContributionUpdatePayload) => Promise<{ message?: string }>;
};

export function AdminPage({
  canModerate,
  activeCourseLanguage,
  courseCategories,
  onLoadContributions,
  onUpdateContributionStatus
}: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>("moderation");

  if (!canModerate) {
    return <div className="panel"><p>Access denied.</p></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-tabs">
        <button
          className={`admin-tab-btn${activeTab === "moderation" ? " active" : ""}`}
          type="button"
          onClick={() => setActiveTab("moderation")}
        >
          Moderation
        </button>
        <button
          className={`admin-tab-btn${activeTab === "users" ? " active" : ""}`}
          type="button"
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          className={`admin-tab-btn${activeTab === "coverage" ? " active" : ""}`}
          type="button"
          onClick={() => setActiveTab("coverage")}
        >
          Content Coverage
        </button>
        <button
          className={`admin-tab-btn${activeTab === "word-cache" ? " active" : ""}`}
          type="button"
          onClick={() => setActiveTab("word-cache")}
        >
          Word Cache
        </button>
      </div>

      {activeTab === "moderation" ? (
        <ContributionInbox
          language={activeCourseLanguage}
          categoryOptions={courseCategories.map((c) => ({ id: c.id, label: c.label }))}
          canModerate={true}
          onLoad={onLoadContributions}
          onUpdateStatus={onUpdateContributionStatus}
        />
      ) : activeTab === "users" ? (
        <AdminUsersPanel />
      ) : activeTab === "coverage" ? (
        <ContentStatsPage canModerate={canModerate} />
      ) : (
        <WordCachePanel />
      )}
    </div>
  );
}

function WordCachePanel() {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<WordCacheRebuildScope | null>(null);
  const [counts, setCounts] = useState<WordTranslationCounts | null>(null);

  const format = (value: number | undefined) =>
    value === undefined ? "—" : value.toLocaleString(navigator.language);

  async function loadCounts() {
    try {
      setCounts(await api.getWordTranslationCounts());
    } catch {
      setCounts(null);
    }
  }

  useEffect(() => {
    loadCounts();
  }, []);

  async function handleRebuild(scope: WordCacheRebuildScope) {
    setLoading(scope);
    setError(null);
    setStatus(null);
    try {
      const result = await api.rebuildWordTranslations(scope);
      setStatus(
        scope === "all"
          ? `Cache cleared — ${format(result.rebuilt)} content entries written.`
          : `Done — ${format(result.rebuilt)} content entries written. LibreTranslate translations were kept.`
      );
      await loadCounts();
    } catch {
      setError("Rebuild failed. Check the server logs.");
    } finally {
      setLoading(null);
      setConfirmingClear(false);
    }
  }

  return (
    <div className="word-cache-panel">
      <h2>Word Translation Cache</h2>
      <p>
        The <code>word_translations</code> table stores two kinds of entries:
      </p>
      <ul>
        <li>
          <strong>Content</strong> — seeded at startup from story glossaries, wordGlossary
          fields, vocabulary flashcards, and hint annotations in the language files.
        </li>
        <li>
          <strong>LibreTranslate</strong> — words the content doesn&apos;t cover. When a
          learner sees one that isn&apos;t cached, it is looked up in the background, so the
          hint is there the next time. Pre-translate fills them in ahead of time.
        </li>
      </ul>
      <p>
        Words LibreTranslate can&apos;t translate (it returns them unchanged) are kept in a
        separate list and not sent again for 7 days.
      </p>

      <p className="word-cache-counts">
        Cached words: <strong>{format(counts?.libretranslate)} LibreTranslate</strong>
        {" · "}
        {format(counts?.content)} content
        {" · "}
        {format(counts?.misses)} skipped as untranslatable
      </p>
      <WordPrefetchSection onProgress={loadCounts} />

      <h3>Rebuild</h3>
      <p>
        Rebuilding re-seeds the content entries from the current language files. Translations
        from LibreTranslate are kept.
      </p>

      {status ? <p className="rebuild-success">{status}</p> : null}
      {error ? <p className="rebuild-error">{error}</p> : null}

      <button
        type="button"
        className="primary-button"
        onClick={() => handleRebuild("content")}
        disabled={loading !== null}
      >
        {loading === "content" ? "Rebuilding…" : "Rebuild content translations"}
      </button>

      <h3>Clear the whole cache</h3>
      <p>
        Only needed when the LibreTranslate translations themselves are wrong, for example after
        the service&apos;s models change. It deletes every cached word and the skipped list,
        then re-seeds the content. Those words show no hint until they are looked up again.
      </p>
      {confirmingClear ? (
        <div className="rebuild-confirm">
          <p>
            This deletes all {format(counts?.libretranslate)} LibreTranslate translations and
            the skipped list, then re-seeds the content. Run Pre-translate afterwards to fetch
            them again. Continue?
          </p>
          <div className="rebuild-confirm-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => handleRebuild("all")}
              disabled={loading !== null}
            >
              {loading === "all" ? "Clearing…" : "Yes, clear everything"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setConfirmingClear(false)}
              disabled={loading !== null}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ghost-button"
          onClick={() => { setStatus(null); setError(null); setConfirmingClear(true); }}
          disabled={loading !== null}
        >
          Clear the whole cache…
        </button>
      )}
    </div>
  );
}

// LibreTranslate may still be starting (it scales to zero), so a chunk that times out
// is retried a few times before the run gives up.
const PREFETCH_RETRIES = 3;
const PREFETCH_RETRY_DELAY_MS = 3000;

type PrefetchProgress = WordPrefetchResult & { translatedTotal: number; missingAtStart: number };

function WordPrefetchSection({ onProgress }: { onProgress: () => Promise<void> }) {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [language, setLanguage] = useState("russian");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PrefetchProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    api.getLanguages()
      .then((list) => setLanguages(list.filter((option) => option.id !== "english")))
      .catch(() => setLanguages([]));
  }, []);

  const format = (value: number) => value.toLocaleString(navigator.language);

  async function run() {
    stopRef.current = false;
    setRunning(true);
    setProgress(null);
    setNotice(null);
    setError(null);
    let cursor = 0;
    let translatedTotal = 0;
    let missingAtStart: number | null = null;
    let failures = 0;
    try {
      while (!stopRef.current) {
        let result: WordPrefetchResult;
        try {
          result = await api.prefetchWordTranslations(language, cursor);
        } catch (err: unknown) {
          if (err instanceof ApiError && err.status === 503 && failures < PREFETCH_RETRIES) {
            failures += 1;
            setNotice("Waiting for LibreTranslate to start…");
            await new Promise((resolve) => window.setTimeout(resolve, PREFETCH_RETRY_DELAY_MS));
            continue;
          }
          throw err;
        }
        failures = 0;
        setNotice(null);
        missingAtStart ??= result.remaining + result.checked;
        translatedTotal += result.translated;
        cursor = result.cursor;
        setProgress({ ...result, translatedTotal, missingAtStart });
        if (result.done) break;
      }
      if (stopRef.current) setNotice("Stopped. Starting again picks up the words still missing.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pre-translation failed.");
    } finally {
      setRunning(false);
      await onProgress();
    }
  }

  const languageLabel = languages.find((option) => option.id === language)?.label || language;

  return (
    <section className="word-prefetch">
      <h3>Pre-translate missing words</h3>
      <p>
        Looks up every word in a course&apos;s exercises and stories that isn&apos;t cached yet, so
        learners don&apos;t wait for LibreTranslate. Only courses with a model in the LibreTranslate
        service can be used (see <code>deploy/libretranslate/Dockerfile</code>).
      </p>
      <div className="word-prefetch-controls">
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          disabled={running}
          aria-label="Course to pre-translate"
        >
          {(languages.length ? languages : [{ id: "russian", label: "Russian" }]).map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        {running ? (
          <button type="button" className="ghost-button" onClick={() => { stopRef.current = true; }}>
            Stop
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={run}>
            Pre-translate {languageLabel}
          </button>
        )}
      </div>
      {progress ? (
        <p className="word-prefetch-progress" aria-live="polite">
          {progress.done
            ? `Done: ${format(progress.translatedTotal)} of ${format(progress.missingAtStart)} missing words translated. `
              + "The rest came back unchanged or empty and are skipped for 7 days."
            : `${format(progress.translatedTotal)} translated · `
              + `${format(progress.missingAtStart - progress.remaining)} of ${format(progress.missingAtStart)} missing words checked`}
        </p>
      ) : null}
      {notice ? <p className="word-prefetch-progress">{notice}</p> : null}
      {error ? <p className="rebuild-error">{error}</p> : null}
    </section>
  );
}
