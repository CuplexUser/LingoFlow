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
  const nextUnlockedCategory = courseCategories.find(
    (category) => category.unlocked && category.attempts === 0
  );

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
        <h2>Course Categories</h2>
        <p className="subtitle">Each session is randomized and adapts to your recent performance.</p>
        <div className="category-grid">
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
    </>
  );
}
