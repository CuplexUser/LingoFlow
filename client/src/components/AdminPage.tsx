import { useState } from "react";
import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload
} from "../api";
import type { CourseCategory } from "../types/course";
import type { ContributionModerationStatus } from "../types/contribution";
import { ContentStatsPage } from "./ContentStatsPage";
import { ContributionInbox } from "./ContributionInbox";

type AdminTab = "coverage" | "moderation";

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
      </div>

      {activeTab === "moderation" ? (
        <ContributionInbox
          language={activeCourseLanguage}
          categoryOptions={courseCategories.map((c) => ({ id: c.id, label: c.label }))}
          canModerate={true}
          onLoad={onLoadContributions}
          onUpdateStatus={onUpdateContributionStatus}
        />
      ) : (
        <ContentStatsPage canModerate={canModerate} />
      )}
    </div>
  );
}
