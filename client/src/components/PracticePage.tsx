import { SessionPlayer } from "./SessionPlayer";
import { SessionPlayerErrorBoundary } from "./SessionPlayerErrorBoundary";
import type { CourseCategory } from "../types/course";
import type { ActiveSession, PracticeMode, SessionReport, SessionSnapshot } from "../types/session";

type PracticePageProps = {
  courseCategories: CourseCategory[];
  activeSession: ActiveSession | null;
  onStartPractice: (mode: PracticeMode, category: CourseCategory) => void | Promise<void>;
  onFinishSession: (sessionReport: SessionReport) => void | Promise<void>;
  onExitSession: () => void;
  onSessionSnapshot: (snapshot: SessionSnapshot) => void;
};

const PRACTICE_MODES: Array<{
  id: PracticeMode;
  title: string;
  description: string;
}> = [
  {
    id: "speak",
    title: "Speak",
    description: "Pronounce short phrases out loud."
  },
  {
    id: "listen",
    title: "Listen",
    description: "Hear the audio and choose the correct phrase."
  },
  {
    id: "words",
    title: "Words",
    description: "Quick tap-to-match 8 words. No dragging."
  }
];

function pickPracticeCategory(courseCategories: CourseCategory[]): CourseCategory | null {
  const unlocked = courseCategories.filter((category) => category.unlocked);
  if (unlocked.length) return unlocked[0];
  return courseCategories[0] || null;
}

export function PracticePage({
  courseCategories,
  activeSession,
  onStartPractice,
  onFinishSession,
  onExitSession,
  onSessionSnapshot
}: PracticePageProps) {
  const practiceCategory = pickPracticeCategory(courseCategories);
  const preferredLabel = practiceCategory?.label || "your course";

  if (activeSession) {
    return (
      <SessionPlayerErrorBoundary>
        <SessionPlayer
          session={activeSession}
          onBack={onExitSession}
          onFinish={onFinishSession}
          onSnapshot={onSessionSnapshot}
        />
      </SessionPlayerErrorBoundary>
    );
  }

  return (
    <>
      <section className="panel hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Practice Mode</p>
          <h2>Target one skill fast.</h2>
          <p>
            Practice pulls from the full course library plus dedicated practice content.
            Using <strong>{preferredLabel}</strong> as the starting point.
          </p>
        </div>
      </section>

      <section className="panel categories">
        <div className="section-heading">
          <div>
            <h2>Practice Focus</h2>
            <p className="subtitle">Speak, listen, or match words with focused practice sets.</p>
          </div>
        </div>

        <div className="category-grid compact-grid">
          {PRACTICE_MODES.map((mode) => (
            <article key={mode.id} className="category-card">
              <div>
                <h3>{mode.title}</h3>
                <p>{mode.description}</p>
                {practiceCategory ? (
                  <p className="lock-note">Using {preferredLabel} as a base.</p>
                ) : (
                  <p className="lock-note">No practice category available.</p>
                )}
              </div>
              <button
                className="primary-button"
                onClick={() => {
                  if (!practiceCategory) return;
                  onStartPractice(mode.id, practiceCategory);
                }}
                disabled={!practiceCategory}
              >
                Start Practice
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
