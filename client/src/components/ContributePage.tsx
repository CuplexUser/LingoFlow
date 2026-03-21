import type { CommunityExercisePayload } from "../api";
import type { CourseCategory } from "../types/course";
import { ContributionPanel } from "./ContributionPanel";

type ContributePageProps = {
  activeCourseLanguage: string;
  courseCategories: CourseCategory[];
  onSubmitContribution: (payload: CommunityExercisePayload) => Promise<{ message?: string }>;
};

export function ContributePage({
  activeCourseLanguage,
  courseCategories,
  onSubmitContribution
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
    </>
  );
}
