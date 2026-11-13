import { useEffect, useRef, useState } from "react";
import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload,
  WordPrefetchResult
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
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ rebuilt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<{ libretranslate: number; content: number; total: number } | null>(null);

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

  async function handleRebuild() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const result = await api.rebuildWordTranslations();
      setStatus(result);
      await loadCounts();
    } catch {
      setError("Rebuild failed. Check the server logs.");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  return (
    <div className="word-cache-panel">
      <h2>Word Translation Cache</h2>
      <p>
        The <code>word_translations</code> table stores two kinds of entries:
      </p>
      <ul>
        <li><strong>Content</strong> — seeded at startup from wordGlossary fields, vocabulary flashcards, and hint annotations in the language files.</li>
        <li><strong>LibreTranslate</strong> — fetched on demand during exercises and cached to avoid repeated API calls.</li>
      </ul>

      <p className="word-cache-counts">
        Cached words:{" "}
        <strong>{counts ? counts.libretranslate.toLocaleString(navigator.language) : "—"} LibreTranslate</strong>
        {" · "}
        {counts ? counts.content.toLocaleString(navigator.language) : "—"} content
      </p>
      <WordPrefetchSection onProgress={loadCounts} />

      <h3>Rebuild</h3>
      <p>
        Rebuilding clears the entire table and re-seeds it from the current language files.
        Any LibreTranslate-fetched translations will be re-fetched on demand as exercises are played.
      </p>

      {status ? (
        <p className="rebuild-success">Done — {status.rebuilt} content entries written.</p>
      ) : null}
      {error ? <p className="rebuild-error">{error}</p> : null}

      {confirming ? (
        <div className="rebuild-confirm">
          <p>This will delete the entire word_translations table and re-seed from the language files. Continue?</p>
          <div className="rebuild-confirm-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleRebuild}
              disabled={loading}
            >
              {loading ? "Rebuilding…" : "Yes, rebuild"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setConfirming(false)}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="primary-button"
          onClick={() => { setStatus(null); setError(null); setConfirming(true); }}
        >
          Rebuild content translations
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
              + "The rest came back unchanged or empty and were skipped."
            : `${format(progress.translatedTotal)} translated · `
              + `${format(progress.missingAtStart - progress.remaining)} of ${format(progress.missingAtStart)} missing words checked`}
        </p>
      ) : null}
      {notice ? <p className="word-prefetch-progress">{notice}</p> : null}
      {error ? <p className="rebuild-error">{error}</p> : null}
    </section>
  );
}
