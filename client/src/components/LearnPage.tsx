import { useMemo, useState } from "react";
import { SessionPlayer } from "./SessionPlayer";
import { SessionPlayerErrorBoundary } from "./SessionPlayerErrorBoundary";
import type { CourseCategory, LearnerProgress, LearnerSettings } from "../types/course";
import type { ActiveSession, SessionReport, SessionSnapshot } from "../types/session";

type LearnPageProps = {
  settings: LearnerSettings | null;
  progress: LearnerProgress | null;
  courseCategories: CourseCategory[];
  activeSession: ActiveSession | null;
  onStartCategory: (category: CourseCategory) => void | Promise<void>;
  onStartDailyChallenge: () => void | Promise<void>;
  onFinishSession: (sessionReport: SessionReport) => void | Promise<void>;
  onExitSession: () => void;
  onSessionSnapshot: (snapshot: SessionSnapshot) => void;
  onOpenSetup: () => void;
  onOpenStats: () => void;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M5 3.5L12 8 5 12.5Z"/>
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8H12.5M9 4.5L12.5 8 9 11.5"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5"/>
      <path d="M5 7V5a3 3 0 0 1 6 0V7"/>
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="14" fill="none" aria-hidden="true">
      <path d="M8 1.5C9.6 4.2 12 5.4 12 8.6a4 4 0 1 1-8 0C4 6.4 5.6 5.6 6.4 4 6.9 5.2 7.4 5.6 8 5.6 8 4.4 7.8 3 8 1.5z" fill="currentColor"/>
      <path d="M8 9C8.7 10 9.6 10.4 9.6 11.6a1.6 1.6 0 1 1-3.2 0C6.4 10.6 7.2 10.4 7.6 9.4z" fill="var(--surface)" opacity="0.85"/>
    </svg>
  );
}

function Mascot() {
  return (
    <svg viewBox="0 0 280 240" className="mascot" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lf-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="var(--paper-light)"/>
          <stop offset="100%" stopColor="var(--paper-mid)"/>
        </linearGradient>
        <linearGradient id="lf-paperShade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="var(--paper-mid)"/>
          <stop offset="100%" stopColor="var(--paper-deep)"/>
        </linearGradient>
        <linearGradient id="lf-beak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="oklch(70% 0.16 35)"/>
          <stop offset="100%" stopColor="oklch(58% 0.16 30)"/>
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="216" rx="78" ry="6" fill="var(--ink)" opacity="0.07"/>
      <g>
        <path d="M232 50L256 38" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
        <path d="M240 72L268 70" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
        <path d="M232 94L258 102" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="262" cy="22" r="3" fill="var(--accent)"/>
        <circle cx="274" cy="52" r="2.5" fill="var(--accent)"/>
        <circle cx="266" cy="118" r="2" fill="var(--accent)"/>
      </g>
      <g opacity="0.82" transform="rotate(-12 36 56)">
        <rect x="22" y="42" width="26" height="26" rx="2" fill="url(#lf-paper)" stroke="var(--paper-deep)" strokeWidth="0.8"/>
        <path d="M24 44L46 66M46 44L24 66" stroke="var(--paper-deep)" strokeWidth="0.6"/>
      </g>
      <g opacity="0.7" transform="rotate(18 222 168)">
        <rect x="214" y="160" width="18" height="18" rx="2" fill="url(#lf-paper)" stroke="var(--paper-deep)" strokeWidth="0.8"/>
        <path d="M215 162L231 178M231 162L215 178" stroke="var(--paper-deep)" strokeWidth="0.5"/>
      </g>
      {/* origami crane */}
      <path d="M82 132L152 70L184 158L116 168Z" fill="url(#lf-paperShade)" stroke="var(--paper-deep)" strokeWidth="1"/>
      <path d="M58 150L152 70L192 160L100 184Z" fill="url(#lf-paper)" stroke="var(--paper-deep)" strokeWidth="1"/>
      <path d="M58 150L128 120L100 184Z" fill="url(#lf-paperShade)" opacity="0.55" stroke="var(--paper-deep)" strokeWidth="0.7"/>
      <path d="M152 70L208 58L184 92Z" fill="url(#lf-paper)" stroke="var(--paper-deep)" strokeWidth="1"/>
      <path d="M208 58L230 56L208 70Z" fill="url(#lf-beak)"/>
      <path d="M58 150L28 166L44 188Z" fill="url(#lf-paperShade)" stroke="var(--paper-deep)" strokeWidth="1"/>
      <g stroke="var(--paper-deep)" strokeWidth="0.6" strokeLinecap="round" opacity="0.75" fill="none">
        <path d="M152 70L128 120L100 184"/>
        <path d="M128 120L192 160"/>
        <path d="M184 92L152 70"/>
      </g>
      <circle cx="184" cy="74" r="2.2" fill="var(--ink)"/>
    </svg>
  );
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const R = 60, C = 2 * Math.PI * R;
  const dash = (value / 100) * C;
  return (
    <div className="ring">
      <svg viewBox="0 0 160 160" width="180" height="180">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--hairline)" strokeWidth="10"/>
        <circle
          cx="80" cy="80" r={R} fill="none"
          stroke="var(--accent)" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 80 80)"
        />
        <text x="80" y="78" className="ring-num" textAnchor="middle">
          {value.toFixed(0)}<tspan className="ring-pct">%</tspan>
        </text>
        <text x="80" y="98" className="ring-lbl" textAnchor="middle">{label}</text>
      </svg>
    </div>
  );
}

function CategoryCard({ c, onStart }: { c: CourseCategory; onStart: () => void }) {
  const tone = c.mastery >= 80 ? "high" : c.mastery >= 60 ? "mid" : c.mastery >= 30 ? "low" : "none";
  const status = !c.unlocked ? "locked" : c.attempts === 0 ? "new" : c.mastery >= 75 ? "mastered" : "in-progress";
  return (
    <article className={`cat-card cat-${status}`}>
      <header className="cat-card-head">
        <span className={`cat-status status-${status}`}>
          {status === "locked" && <LockIcon />}
          {status === "new" && "New"}
          {status === "mastered" && "Mastered"}
          {status === "in-progress" && `${c.mastery.toFixed(0)}% mastery`}
        </span>
        <span className="cat-level-pill mono">{c.levelUnlocked.toUpperCase()}</span>
      </header>
      <h4 className="cat-name">{c.label}</h4>
      <p className="cat-desc">{c.description}</p>
      <div>
        <div className="cat-progress-track">
          <div className={`cat-progress-fill tone-${tone}`} style={{ width: `${Math.max(2, c.mastery)}%` }}/>
        </div>
        <div className="cat-progress-meta">
          <span className="mono" style={{ color: "var(--muted)", fontSize: "11.5px" }}>{c.totalPhrases ?? 0} phrases</span>
          <span className="mono" style={{ color: "var(--muted)", fontSize: "11.5px" }}>{c.attempts} sessions</span>
        </div>
      </div>
      {c.unlocked ? (
        <button
          className={`cat-btn${c.recommended ? " btn-primary-lg" : " btn-outline-lg"}`}
          style={{ marginTop: 0 }}
          onClick={onStart}
        >
          <PlayIcon /> {c.attempts === 0 ? "Start" : "Continue"}
        </button>
      ) : (
        <div className="cat-lock-notice"><LockIcon /> {c.lockReason}</div>
      )}
    </article>
  );
}

export function LearnPage({
  settings,
  progress,
  courseCategories,
  activeSession,
  onStartCategory,
  onStartDailyChallenge,
  onFinishSession,
  onExitSession,
  onSessionSnapshot,
  onOpenSetup,
  onOpenStats
}: LearnPageProps) {
  const [filter, setFilter] = useState<"all" | "in-progress" | "mastered" | "locked">("all");

  const recommended = useMemo(() =>
    courseCategories.find((c) => c.recommended && c.unlocked && c.attempts > 0) ||
    courseCategories.find((c) => c.recommended && c.unlocked) ||
    courseCategories.find((c) => c.unlocked && c.attempts === 0) ||
    courseCategories[0] || null,
    [courseCategories]
  );

  const totalPhrases = courseCategories.reduce((s, c) => s + (c.totalPhrases ?? 0), 0);
  const masteredCount = courseCategories.filter((c) => c.mastery >= 75).length;

  const dailyProgressPercent = useMemo(() => {
    if (!settings || !progress) return 0;
    return Math.min(100, Math.round(((progress.todayXp || 0) / settings.dailyGoal) * 100));
  }, [settings, progress]);

  const filteredCategories = useMemo(() => {
    if (filter === "all") return courseCategories;
    if (filter === "in-progress") return courseCategories.filter((c) => c.unlocked && c.attempts > 0 && c.mastery < 75);
    if (filter === "mastered") return courseCategories.filter((c) => c.mastery >= 75);
    if (filter === "locked") return courseCategories.filter((c) => !c.unlocked);
    return courseCategories;
  }, [courseCategories, filter]);

  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

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
    <div className="learn">
      {/* Hero */}
      <section className="learn-hero">
        <div className="learn-hero-text">
          <div className="learn-kicker">Daily Practice · {dateLabel}</div>
          <h2 className="learn-hero-title">
            Hi <span className="ink-bold">{settings?.learnerName?.split(" ")[0] || "Learner"}</span>,<br/>
            ready for<br/>
            <span className="learn-hero-emph">a quick challenge?</span>
          </h2>
          <p className="learn-hero-sub">
            One focused session keeps your <strong>{progress?.streak ?? 0}-day</strong> streak alive.
            {settings?.focusArea ? <> Today&apos;s focus: <strong>{settings.focusArea}</strong>.</> : null}
          </p>
          <div className="learn-hero-actions">
            <button className="btn-primary-lg" onClick={onStartDailyChallenge}>
              <PlayIcon /> Daily challenge
            </button>
            <button className="btn-outline-lg" onClick={onOpenSetup}>Edit setup</button>
            <button className="btn-ghost-lg" onClick={onOpenStats}>View stats <ArrowIcon /></button>
          </div>
          <div className="learn-hero-meta">
            <div>
              <span className="learn-meta-label">Today&apos;s goal</span>
              <div className="learn-meta-bar-row">
                <div className="learn-meta-bar">
                  <div className="learn-meta-bar-fill" style={{ width: `${dailyProgressPercent}%` }}/>
                </div>
                <span className="mono" style={{ fontSize: "12.5px" }}>{dailyProgressPercent}%</span>
              </div>
            </div>
            <div>
              <span className="learn-meta-label">Streak</span>
              <div className="learn-meta-streak">
                <FlameIcon />
                <span className="mono">{progress?.streak ?? 0}</span> days
              </div>
            </div>
            <div>
              <span className="learn-meta-label">XP today</span>
              <div className="learn-meta-xp mono">+{progress?.todayXp ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="learn-hero-art" aria-hidden="true">
          <Mascot />
        </div>
      </section>

      {/* Recommended next */}
      {recommended && (
        <section className="recommended-card">
          <div>
            <div className="learn-kicker accent">Recommended next</div>
            <h3 className="recommended-title">{recommended.label}</h3>
            <p className="recommended-desc">{recommended.description}</p>
            <div className="recommended-stats">
              <div>
                <div className="rec-stat-num mono">{recommended.totalPhrases ?? 0}</div>
                <div className="rec-stat-lbl">phrases</div>
              </div>
              <div>
                <div className="rec-stat-num mono">{recommended.mastery.toFixed(0)}<small>%</small></div>
                <div className="rec-stat-lbl">mastery</div>
              </div>
              <div>
                <div className="rec-stat-num">{recommended.levelUnlocked.toUpperCase()}</div>
                <div className="rec-stat-lbl">level</div>
              </div>
              <div>
                <div className="rec-stat-num mono">{recommended.attempts}</div>
                <div className="rec-stat-lbl">attempts</div>
              </div>
            </div>
            <button
              className="btn-primary-lg"
              onClick={() => onStartCategory(recommended)}
              disabled={!recommended.unlocked}
            >
              <PlayIcon /> Start recommended session
            </button>
          </div>
          <div className="recommended-visual">
            <ProgressRing value={recommended.mastery} label="mastery"/>
            <p style={{ fontSize: "12px", textAlign: "center", maxWidth: 200, margin: 0, color: "var(--muted)" }}>
              Best next target based on mastery
            </p>
          </div>
        </section>
      )}

      {/* Category catalog */}
      <section className="cat-section">
        <div className="cat-section-head">
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>Pick up where you left off</h3>
            <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: 2 }}>
              {courseCategories.length} categories · {totalPhrases.toLocaleString()} phrases · {masteredCount} mastered
            </div>
          </div>
          <div className="seg" style={{ fontSize: "11.5px" }}>
            {(["all", "in-progress", "mastered", "locked"] as const).map((f) => (
              <button
                key={f}
                className={`seg-btn${filter === f ? " on" : ""}`}
                style={{ padding: "4px 9px", fontSize: "11.5px" }}
                onClick={() => setFilter(f)}
              >
                {f === "in-progress" ? "In progress" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="cat-grid">
          {filteredCategories.map((c) => (
            <CategoryCard key={c.id} c={c} onStart={() => onStartCategory(c)} />
          ))}
        </div>
      </section>
    </div>
  );
}
