import { useState } from "react";
import { useCourse } from "../context/CourseContext";
import { useSession } from "../context/SessionContext";
import type { Ability, KnowledgeSkill, SkillState } from "../types/knowledge";

type Filter = "all" | "weak" | "shaky" | "due" | "known";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "weak", label: "Weak" },
  { id: "shaky", label: "Shaky" },
  { id: "due", label: "Due for review" },
  { id: "known", label: "Known" }
];

// Each state has a color and a word, so the page never relies on color alone.
export const SKILL_STATE_LABEL: Record<SkillState, string> = {
  not_started: "Not started",
  learning: "Learning",
  weak: "Weak",
  shaky: "Shaky",
  known: "Known",
  strong: "Strong"
};

const ABILITIES: Array<{ id: Ability; label: string }> = [
  { id: "reading", label: "Reading" },
  { id: "listening", label: "Listening" },
  { id: "speaking", label: "Speaking" },
  { id: "writing", label: "Writing" }
];

function matches(skill: KnowledgeSkill, filter: Filter): boolean {
  if (filter === "weak") return skill.state === "weak";
  if (filter === "shaky") return skill.state === "shaky";
  if (filter === "due") return skill.dueCount > 0;
  if (filter === "known") return skill.state === "known" || skill.state === "strong";
  return true;
}

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

// "What you know": every skill of the course by level and unit, with its state.
export function KnowledgePage({ currentLevel }: { currentLevel?: string }) {
  const { knowledge } = useCourse();
  const { practiceSkill } = useSession();
  const [viewed, setViewed] = useState(currentLevel || "a1");
  const [filter, setFilter] = useState<Filter>("all");

  if (!knowledge) {
    return (
      <div className="knowledge-page">
        <p className="knowledge-empty">Your knowledge map shows up here once your course has loaded.</p>
      </div>
    );
  }

  const level = knowledge.levels.find((entry) => entry.id === viewed) || knowledge.levels[0];
  if (!level) return null;
  const units = level.units
    .map((unit) => ({ unit, skills: unit.skills.filter((skill) => matches(skill, filter)) }))
    .filter((entry) => entry.skills.length);

  return (
    <div className="knowledge-page">
      <header className="knowledge-hero">
        <div>
          <div className="knowledge-eyebrow">What you know</div>
          <h2 className="knowledge-title">{level.label} {level.name}</h2>
          <p className="knowledge-sub">
            {level.premium ? `${level.skillsTotal} skills, part of Premium` : `${level.skillsKnown} of ${level.skillsTotal} skills known`}
          </p>
        </div>
        <div className="knowledge-levels" role="group" aria-label="Level">
          {knowledge.levels.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`knowledge-chip${entry.id === level.id ? " active" : ""}`}
              aria-pressed={entry.id === level.id}
              onClick={() => setViewed(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </header>

      {level.premium ? (
        <p className="knowledge-empty">The skills of {level.label} are part of LingoFlow Premium in the app.</p>
      ) : (
        <>
          <div className="knowledge-filters" role="group" aria-label="Show">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`knowledge-chip${filter === entry.id ? " active" : ""}`}
                aria-pressed={filter === entry.id}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {units.length ? (
            <div className="knowledge-units">
              {units.map(({ unit, skills }) => (
                <article key={unit.category} className="chart-card-new knowledge-unit" aria-labelledby={`ku-${unit.category}`}>
                  <header className="chart-card-new-head">
                    <h3 id={`ku-${unit.category}`} className="chart-card-title">{unit.label}</h3>
                    {unit.abilities ? (
                      <ul className="knowledge-abilities" aria-label="By kind of exercise">
                        {ABILITIES.map(({ id, label }) => (
                          <li key={id}>{label} <span className="mono">{percent(unit.abilities?.[id].accuracy ?? null)}</span></li>
                        ))}
                      </ul>
                    ) : null}
                  </header>
                  <ul className="knowledge-skills">
                    {skills.map((skill) => (
                      <li key={skill.id} className="knowledge-skill">
                        <div className="knowledge-skill-text">
                          <span className="knowledge-skill-name">{skill.label}</span>
                          <span className="knowledge-skill-sub">
                            {skill.description ? `${skill.description} · ` : ""}
                            {skill.itemsSeen} of {skill.itemsTotal} phrases
                            {skill.accuracy === null ? "" : ` · ${percent(skill.accuracy)} right`}
                            {skill.dueCount ? ` · ${skill.dueCount} due` : ""}
                          </span>
                        </div>
                        <span className={`skill-pill skill-${skill.state}`}>{SKILL_STATE_LABEL[skill.state]}</span>
                        <button
                          type="button"
                          className="btn-ghost-lg knowledge-practice"
                          aria-label={`Practice ${skill.label}`}
                          onClick={() => void practiceSkill({ id: skill.id, label: skill.label, category: unit.category })}
                        >
                          Practice
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="knowledge-empty">
              {filter === "all" ? "No skills at this level yet." : "No skills here right now."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
