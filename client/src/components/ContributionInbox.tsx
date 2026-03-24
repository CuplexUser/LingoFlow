import { useEffect, useState } from "react";
import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload
} from "../api";
import type {
  ContributionModerationStatus,
  ContributionSubmission
} from "../types/contribution";

type ContributionInboxProps = {
  language: string;
  categoryOptions: Array<{ id: string; label: string }>;
  canModerate: boolean;
  onLoad: (params: {
    scope?: "mine" | "all";
    status?: ContributionModerationStatus | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => Promise<CommunityContributionListResponse>;
  onUpdateStatus: (id: number, payload: CommunityContributionUpdatePayload) => Promise<{ message?: string }>;
};

export function ContributionInbox({
  language,
  categoryOptions,
  canModerate,
  onLoad,
  onUpdateStatus
}: ContributionInboxProps) {
  const [scope, setScope] = useState<"mine" | "all">(canModerate ? "all" : "mine");
  const [statusFilter, setStatusFilter] = useState<ContributionModerationStatus | "">("pending");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [submissions, setSubmissions] = useState<ContributionSubmission[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!canModerate) {
      setScope("mine");
    }
  }, [canModerate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setBusy(true);
      try {
        const result = await onLoad({
          scope: canModerate ? scope : "mine",
          status: statusFilter,
          language,
          category: categoryFilter,
          limit: 100
        });
        if (!cancelled) {
          setSubmissions(result.submissions || []);
          setMessage("");
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setSubmissions([]);
          setMessage(error instanceof Error ? error.message : "Could not load contributions.");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [canModerate, scope, statusFilter, language, categoryFilter, onLoad]);

  async function updateStatus(id: number, moderationStatus: ContributionModerationStatus) {
    try {
      setBusy(true);
      const result = await onUpdateStatus(id, { moderationStatus });
      setSubmissions((current) =>
        current.map((submission) =>
          submission.id === id ? { ...submission, moderationStatus } : submission
        )
      );
      setMessage(result.message || `Contribution marked ${moderationStatus}.`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not update contribution status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel contribution-panel">
      <div className="section-heading">
        <div>
          <h2>{canModerate ? "Contribution Inbox" : "My Submissions"}</h2>
          <p className="subtitle">
            {canModerate
              ? "Review pending community ideas and change their moderation status."
              : "Track what you have submitted without opening the database manually."}
          </p>
        </div>
      </div>

      <div className="settings-grid contribution-filters">
        {canModerate ? (
          <label>
            Scope
            <select value={scope} onChange={(event) => setScope(event.target.value as "mine" | "all")}>
              <option value="all">All submissions</option>
              <option value="mine">My submissions</option>
            </select>
          </label>
        ) : null}

        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as ContributionModerationStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label>
          Category
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="status">{message}</div> : null}
      {busy ? <p className="subtitle">Loading submissions...</p> : null}

      <div className="contribution-list">
        {!busy && submissions.length === 0 ? (
          <div className="setup-preview">
            <h3>No submissions found</h3>
            <p>Try a different filter, or submit the first idea for this view.</p>
          </div>
        ) : null}

        {submissions.map((submission) => (
          <article key={submission.id} className="setup-preview contribution-card">
            <div className="section-heading">
              <div>
                <h3>{submission.prompt}</h3>
                <p className="subtitle">
                  {submission.language} · {submission.category} · {submission.difficulty.toUpperCase()} · {submission.exerciseType}
                </p>
              </div>
              <strong className={`contribution-status status-${submission.moderationStatus}`}>
                {submission.moderationStatus}
              </strong>
            </div>
            <p><strong>Proposal:</strong> {submission.correctAnswer}</p>
            {submission.hints.length ? <p><strong>Hints:</strong> {submission.hints.join(" | ")}</p> : null}
            {submission.culturalNote ? <p><strong>Context:</strong> {submission.culturalNote}</p> : null}
            {submission.submitter ? (
              <p className="subtitle">
                Submitted by {submission.submitter.displayName} ({submission.submitter.email})
              </p>
            ) : null}
            <p className="subtitle">Created {new Date(submission.createdAt).toLocaleString()}</p>

            {canModerate ? (
              <div className="hero-actions">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={busy || submission.moderationStatus === "pending"}
                  onClick={() => updateStatus(submission.id, "pending")}
                >
                  Mark Pending
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy || submission.moderationStatus === "approved"}
                  onClick={() => updateStatus(submission.id, "approved")}
                >
                  Approve
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={busy || submission.moderationStatus === "rejected"}
                  onClick={() => updateStatus(submission.id, "rejected")}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
