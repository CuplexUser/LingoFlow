import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload,
  CommunityExercisePayload
} from "../api";
import type { CourseCategory, LanguageOption } from "../types/course";
import type { ContributionModerationStatus } from "../types/contribution";
import { ContributionInbox } from "./ContributionInbox";
import { ContributionPanel } from "./ContributionPanel";

type ContributePageProps = {
  activeCourseLanguage: string;
  courseLanguages: LanguageOption[];
  courseCategories: CourseCategory[];
  onSubmitContribution: (payload: CommunityExercisePayload) => Promise<{ message?: string }>;
  onLoadContributions: (params: {
    scope?: "mine" | "all";
    status?: ContributionModerationStatus | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => Promise<CommunityContributionListResponse>;
  onUpdateContributionStatus: (id: number, payload: CommunityContributionUpdatePayload) => Promise<{ message?: string }>;
};

export function ContributePage({
  activeCourseLanguage,
  courseLanguages,
  courseCategories,
  onSubmitContribution,
  onLoadContributions,
  onUpdateContributionStatus
}: ContributePageProps) {
  return (
    <>
      <ContributionPanel
        language={activeCourseLanguage}
        languages={courseLanguages}
        categories={courseCategories}
        onSubmit={onSubmitContribution}
      />

      <ContributionInbox
        language={activeCourseLanguage}
        categoryOptions={courseCategories.map((c) => ({ id: c.id, label: c.label }))}
        canModerate={false}
        onLoad={onLoadContributions}
        onUpdateStatus={onUpdateContributionStatus}
      />
    </>
  );
}
