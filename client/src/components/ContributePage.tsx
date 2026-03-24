import type {
  CommunityContributionListResponse,
  CommunityContributionUpdatePayload,
  CommunityExercisePayload
} from "../api";
import type { CourseCategory } from "../types/course";
import { ContributionInbox } from "./ContributionInbox";
import { ContributionPanel } from "./ContributionPanel";

type ContributePageProps = {
  canModerateCommunityExercises: boolean;
  activeCourseLanguage: string;
  courseCategories: CourseCategory[];
  onSubmitContribution: (payload: CommunityExercisePayload) => Promise<{ message?: string }>;
  onLoadContributions: (params: {
    scope?: "mine" | "all";
    status?: "pending" | "approved" | "rejected" | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => Promise<CommunityContributionListResponse>;
  onUpdateContributionStatus: (id: number, payload: CommunityContributionUpdatePayload) => Promise<{ message?: string }>;
};

export function ContributePage({
  canModerateCommunityExercises,
  activeCourseLanguage,
  courseCategories,
  onSubmitContribution,
  onLoadContributions,
  onUpdateContributionStatus
}: ContributePageProps) {
  return (
    <>
      <section className="panel hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Community Content</p>
          <h2>Share a contribution idea</h2>
          <p>
            Submit ideas for lessons, media, cultural context, learner flows, or content improvements.
            This keeps the Learn page focused while still making community input easy to capture.
          </p>
        </div>
      </section>

      <ContributionPanel
        language={activeCourseLanguage}
        categories={courseCategories}
        onSubmit={onSubmitContribution}
      />

      <ContributionInbox
        language={activeCourseLanguage}
        categoryOptions={courseCategories.map((category) => ({ id: category.id, label: category.label }))}
        canModerate={canModerateCommunityExercises}
        onLoad={onLoadContributions}
        onUpdateStatus={onUpdateContributionStatus}
      />
    </>
  );
}
