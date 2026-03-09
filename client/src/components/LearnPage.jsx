import { useMemo, useState } from "react";
import mascotHero from "../assets/mascot-hero.png";
import { SessionPlayer } from "./SessionPlayer";

export function LearnPage({
  settings,
  progress,
  courseCategories,
  activeSession,
  onStartCategory,
  onFinishSession,
  onExitSession,
  onSessionSnapshot,
  onOpenSetup,
  onOpenStats
}) {
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const nextUnlockedCategory = courseCategories.find(
    (category) => category.unlocked && category.attempts === 0
  );
  const unlockedCategories = useMemo(
    () => courseCategories.filter((category) => category.unlocked),
    [courseCategories]
  );
  const lockedCategories = useMemo(
    () => courseCategories.filter((category) => !category.unlocked),
    [courseCategories]
  );
  const continueCategory = nextUnlockedCategory ||
    [...unlockedCategories].sort((left, right) => left.mastery - right.mastery)[0] ||
    courseCategories[0] ||
    null;
  const spotlightCategories = [
    continueCategory,
    ...unlockedCategories.filter((category) => category.id !== continueCategory?.id),
    ...lockedCategories
  ]
    .filter(Boolean)
    .slice(0, 4);
  const totalPhrases = courseCategories.reduce(
    (sum, category) => sum + (category.totalPhrases || 0),
    0
  );
  const masteredCategories = courseCategories.filter((category) => category.mastery >= 75).length;
  const recommendedCategories = courseCategories.filter((category) => category.recommended).slice(0, 3);
  const betaCategories = courseCategories.filter((category) => category.beta);

  if (activeSession) {
    return (
      <SessionPlayer
        session={activeSession}
        onBack={onExitSession}
        onFinish={onFinishSession}
        onSnapshot={(snapshot) => onSessionSnapshot(snapshot)}
      />
    );
  }

  return (
    <>
      <section className="panel hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Daily Practice</p>
          <h2>Hi {settings?.learnerName || "Learner"}, ready for a quick challenge?</h2>
          <p>
            Keep your streak alive by finishing one category. Your current focus is
            {" "}<strong>{settings?.focusArea || "everyday conversation"}</strong>.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onOpenSetup}>Edit Setup</button>
            <button className="ghost-button" onClick={onOpenStats}>View Stats</button>
          </div>
        </div>
        <img src={mascotHero} alt="Cartoon Lingo buddy" className="hero-art" />
      </section>

      <section className="panel categories">
        <div className="section-heading">
          <div>
            <h2>Course Categories</h2>
            <p className="subtitle">A tighter path up top, with the full course catalog one click away.</p>
          </div>
          <div className="category-totals">
            <strong>{totalPhrases} phrases</strong>
            <span>{masteredCategories}/{courseCategories.length} mastered</span>
          </div>
        </div>

        {continueCategory ? (
          <div className="learning-focus">
            <article className="focus-card">
              <p className="eyebrow">Recommended Next</p>
              <h3>{continueCategory.label}</h3>
              <p>{continueCategory.description}</p>
              <div className="focus-metrics">
                <span>{continueCategory.totalPhrases || 0} phrases</span>
                <span>Mastery {continueCategory.mastery.toFixed(1)}%</span>
                <span>{continueCategory.levels?.join(" ").toUpperCase() || "A1"}</span>
                {continueCategory.mediaRichCount ? <span>{continueCategory.mediaRichCount} with media</span> : null}
              </div>
              <p className="focus-note">
                {continueCategory.attempts === 0
                  ? "Fresh category ready to unlock more of the path."
                  : "Best next practice target based on your current mastery."}
              </p>
              <button
                className="primary-button"
                onClick={() => onStartCategory(continueCategory)}
                disabled={!continueCategory.unlocked}
              >
                {continueCategory.unlocked ? "Start Recommended Session" : "Locked"}
              </button>
            </article>

            <div className="spotlight-grid">
              {spotlightCategories
                .filter((category) => category.id !== continueCategory.id)
                .map((category) => (
                  <article
                    key={category.id}
                    className={`spotlight-card ${category.unlocked ? "" : "locked"}`}
                  >
                    <div>
                      <p className="eyebrow">{category.unlocked ? "Open" : "Coming Up"}</p>
                      <h3>{category.label}</h3>
                      <p>{category.description}</p>
                      {category.sampleCulturalNotes?.[0] ? (
                        <p className="lock-note">Cultural note: {category.sampleCulturalNotes[0]}</p>
                      ) : null}
                    </div>
                    <div className="spotlight-meta">
                      <span>{category.totalPhrases || 0} phrases</span>
                      <span>{category.levelUnlocked.toUpperCase()}</span>
                      {category.recommended ? <span>Recommended</span> : null}
                    </div>
                    {category.unlocked ? (
                      <button
                        className="ghost-button"
                        onClick={() => onStartCategory(category)}
                      >
                        Quick Start
                      </button>
                    ) : (
                      <p className="lock-note">{category.lockReason}</p>
                    )}
                  </article>
                ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel categories">
        <div className="section-heading">
          <div>
            <h2>Course Path</h2>
            <p className="subtitle">Every category stays visible here, but in a condensed, scan-friendly format.</p>
          </div>
        </div>

        <div className="category-list">
          {courseCategories.map((category) => (
            <article
              key={category.id}
              className={`category-row ${category.unlocked ? "" : "locked"}`}
            >
              <div className="category-row-main">
                <div>
                  <h3>{category.label}</h3>
                  <p>{category.description}</p>
                </div>
                <div className="category-row-badges">
                  <span>{category.totalPhrases || 0} phrases</span>
                  <span>{category.levelUnlocked.toUpperCase()}</span>
                  <span>{category.accuracy.toFixed(1)}% accuracy</span>
                  {category.recommended ? <span>Recommended</span> : null}
                  {category.beta ? <span>Beta</span> : null}
                </div>
              </div>
              <div className="category-row-progress">
                <div className="mini-meter" aria-hidden="true">
                  <div style={{ width: `${Math.max(4, category.mastery)}%` }} />
                </div>
                <strong>{category.mastery.toFixed(1)}%</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel categories">
        <div className="section-heading">
          <div>
            <h2>Browse All Categories</h2>
            <p className="subtitle">Open the full catalog only when you want deeper control.</p>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => setShowFullCatalog((current) => !current)}
            aria-expanded={showFullCatalog}
          >
            {showFullCatalog ? "Hide Catalog" : "Show Catalog"}
          </button>
        </div>

        {showFullCatalog ? (
          <div className="category-grid compact-grid">
            {courseCategories.map((category) => (
              <article
                key={category.id}
                className={`category-card ${category.unlocked ? "" : "locked"}`}
              >
                <div>
                  <h3>{category.label}</h3>
                  <p>{category.description}</p>
                  <p>Mastery: {category.mastery.toFixed(1)}%</p>
                  <p>Accuracy: {category.accuracy.toFixed(1)}%</p>
                  <p>Unlocked: {category.levelUnlocked.toUpperCase()}</p>
                  <p>Content: {category.totalPhrases || 0} phrases</p>
                  {!category.unlocked ? <p className="lock-note">{category.lockReason}</p> : null}
                </div>
                <button
                  className="primary-button"
                  onClick={() => onStartCategory(category)}
                  disabled={!category.unlocked}
                >
                  {category.unlocked ? "Start Challenge" : "Locked"}
                </button>
              </article>
            ))}
          </div>
        ) : null}

        {nextUnlockedCategory ? (
          <p className="subtitle">Next recommended: {nextUnlockedCategory.label}</p>
        ) : null}
      </section>

      <section className="panel quick-strip">
        <div>
          <strong>Level {progress?.learnerLevel ?? 1}</strong>
          <span>{progress?.totalXp ?? 0} XP</span>
        </div>
        <div>
          <strong>{progress?.streak ?? 0} day streak</strong>
          <span>Keep your practice rhythm going</span>
        </div>
      </section>

      {recommendedCategories.length ? (
        <section className="panel categories">
          <div className="section-heading">
            <div>
              <h2>Adaptive Recommendations</h2>
              <p className="subtitle">Suggestions based on your weak spots and strongest areas.</p>
            </div>
          </div>
          <div className="category-grid compact-grid">
            {recommendedCategories.map((category) => (
              <article key={category.id} className="category-card">
                <div>
                  <h3>{category.label}</h3>
                  <p>{category.description}</p>
                  <p>Mastery: {category.mastery.toFixed(1)}%</p>
                  <p>Accuracy: {category.accuracy.toFixed(1)}%</p>
                </div>
                <button className="primary-button" onClick={() => onStartCategory(category)}>
                  Start Targeted Practice
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {betaCategories.length ? (
        <section className="panel categories">
          <div className="section-heading">
            <div>
              <h2>Experimental Lessons</h2>
              <p className="subtitle">Beta categories for richer cultural and scenario-driven content.</p>
            </div>
          </div>
          <div className="category-grid compact-grid">
            {betaCategories.map((category) => (
              <article key={category.id} className="category-card">
                <div>
                  <h3>{category.label}</h3>
                  <p>{category.description}</p>
                  {category.sampleCulturalNotes?.map((note) => (
                    <p key={note} className="lock-note">{note}</p>
                  ))}
                </div>
                <button
                  className="ghost-button"
                  onClick={() => onStartCategory(category)}
                  disabled={!category.unlocked}
                >
                  {category.unlocked ? "Try Beta Lesson" : "Locked"}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
