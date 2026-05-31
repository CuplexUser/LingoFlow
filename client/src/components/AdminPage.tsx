import { useEffect, useState } from "react";
import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload
} from "../api";
import { api } from "../api";
import type { CourseCategory } from "../types/course";
import type { ContributionModerationStatus } from "../types/contribution";
import { ContentStatsPage } from "./ContentStatsPage";
import { ContributionInbox } from "./ContributionInbox";

type AdminTab = "coverage" | "moderation" | "word-cache";

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
