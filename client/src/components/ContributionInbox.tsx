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

const STATUS_LABELS: Record<ContributionModerationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes Requested"
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

  // Per-card comment state for moderators
  const [commentDraft, setCommentDraft] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchComment, setBatchComment] = useState("");

  useEffect(() => {
    if (!canModerate) setScope("mine");
  }, [canModerate]);

  useEffect(() => {
    let cancelled = false;
    setSelectedIds(new Set());

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
        if (!cancelled) setBusy(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [canModerate, scope, statusFilter, language, categoryFilter, onLoad]);

  async function updateStatus(id: number, moderationStatus: ContributionModerationStatus) {
    const reviewerComment = commentDraft[id] || "";
    try {
      setBusy(true);
      const result = await onUpdateStatus(id, { moderationStatus, reviewerComment });
      setSubmissions((current) =>
        current.map((s) =>
          s.id === id ? { ...s, moderationStatus, reviewerComment, reviewedAt: new Date().toISOString() } : s
        )
      );
      setCommentDraft((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setExpandedId(null);
      setMessage(result.message || `Contribution marked ${moderationStatus}.`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not update contribution status.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBatch(moderationStatus: ContributionModerationStatus) {
    if (selectedIds.size === 0) return;
    setBusy(true);
    let done = 0;
    for (const id of selectedIds) {
      try {
        await onUpdateStatus(id, { moderationStatus, reviewerComment: batchComment });
        done++;
      } catch (_err) { /* continue */ }
    }
    setSubmissions((current) =>
      current.map((s) =>
        selectedIds.has(s.id)
          ? { ...s, moderationStatus, reviewerComment: batchComment, reviewedAt: new Date().toISOString() }
          : s
      )
    );
    setSelectedIds(new Set());
    setBatchComment("");
    setBusy(false);
    setMessage(`Bulk action applied to ${done} submission${done !== 1 ? "s" : ""}.`);
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === submissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submissions.map((s) => s.id)));
    }
  }

  const allSelected = submissions.length > 0 && selectedIds.size === submissions.length;

  return (
    <section className="panel contribution-panel">
      <div className="section-heading">
        <div>
          <h2>{canModerate ? "Contribution Inbox" : "My Submissions"}</h2>
          <p className="subtitle">
            {canModerate
              ? "Review pending community ideas and change their moderation status."
              : "Track what you have submitted and view reviewer feedback."}
          </p>
        </div>
      </div>

      <div className="settings-grid contribution-filters">
        {canModerate ? (
          <label>
            Scope
            <select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")}>
              <option value="all">All submissions</option>
              <option value="mine">My submissions</option>
            </select>
          </label>
        ) : null}

        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContributionModerationStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="changes_requested">Changes Requested</option>
          </select>
        </label>

        <label>
          Category
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </label>
      </div>

      {message ? <div className="status">{message}</div> : null}
      {busy ? <p className="subtitle">Loading...</p> : null}

      {canModerate && submissions.length > 0 ? (
        <div className="batch-toolbar">
          <label className="batch-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            {allSelected ? "Deselect all" : `Select all (${submissions.length})`}
          </label>

          {selectedIds.size > 0 ? (
            <div className="batch-actions">
              <span className="subtitle">{selectedIds.size} selected</span>
              <input
                className="batch-comment-input"
                type="text"
                placeholder="Reviewer comment (optional)"
                value={batchComment}
                onChange={(e) => setBatchComment(e.target.value)}
                maxLength={1000}
              />
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={() => applyBatch("approved")}
              >
                Approve selected
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={busy}
                onClick={() => applyBatch("rejected")}
              >
                Reject selected
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={busy}
                onClick={() => applyBatch("changes_requested")}
              >
                Request changes
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="contribution-list">
        {!busy && submissions.length === 0 ? (
          <div className="setup-preview">
            <h3>No submissions found</h3>
            <p>Try a different filter, or submit the first idea for this view.</p>
          </div>
        ) : null}

        {submissions.map((submission) => {
          const isExpanded = expandedId === submission.id;
          const draft = commentDraft[submission.id] || "";

          return (
            <article key={submission.id} className="setup-preview contribution-card">
              <div className="section-heading">
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  {canModerate ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(submission.id)}
                      onChange={() => toggleSelect(submission.id)}
                      style={{ marginTop: "4px", flexShrink: 0 }}
                    />
                  ) : null}
                  <div>
                    <h3>{submission.prompt}</h3>
                    <p className="subtitle">
                      {submission.language} · {submission.category} · {submission.difficulty.toUpperCase()} · {submission.exerciseType}
                    </p>
                  </div>
                </div>
                <strong className={`contribution-status status-${submission.moderationStatus}`}>
                  {STATUS_LABELS[submission.moderationStatus] ?? submission.moderationStatus}
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

              {submission.reviewerComment ? (
                <div className="reviewer-feedback">
                  <strong>Reviewer feedback:</strong> {submission.reviewerComment}
                  {submission.reviewedBy ? (
                    <span className="subtitle"> — {submission.reviewedBy.displayName}
                      {submission.reviewedAt ? `, ${new Date(submission.reviewedAt).toLocaleString()}` : ""}
                    </span>
                  ) : null}
                </div>
              ) : submission.reviewedAt ? (
                <p className="subtitle">
                  Reviewed {new Date(submission.reviewedAt).toLocaleString()}
                  {submission.reviewedBy ? ` by ${submission.reviewedBy.displayName}` : ""}
                </p>
              ) : null}

              {canModerate ? (
                <>
                  {isExpanded ? (
                    <div className="reviewer-comment-form">
                      <label>
                        Reviewer comment (optional)
                        <textarea
                          value={draft}
                          onChange={(e) => setCommentDraft((prev) => ({ ...prev, [submission.id]: e.target.value }))}
                          placeholder="Leave feedback for the contributor..."
                          maxLength={1000}
                          rows={3}
                        />
                      </label>
                      <div className="hero-actions">
                        <button
                          className="primary-button"
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(submission.id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(submission.id, "changes_requested")}
                        >
                          Request Changes
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={busy}
                          onClick={() => updateStatus(submission.id, "rejected")}
                        >
                          Reject
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={busy || submission.moderationStatus === "pending"}
                          onClick={() => updateStatus(submission.id, "pending")}
                        >
                          Mark Pending
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => setExpandedId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="hero-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setExpandedId(submission.id)}
                      >
                        Review
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
