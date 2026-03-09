import { ContributionPanel } from "./ContributionPanel";

export function ContributePage({ activeCourseLanguage, courseCategories, onSubmitContribution }) {
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
