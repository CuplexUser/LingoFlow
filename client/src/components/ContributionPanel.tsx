import { useState, type FormEvent } from "react";
import type { CommunityExercisePayload } from "../api";
import type { CourseCategory, LanguageOption } from "../types/course";
import type {
  ContributionExerciseType,
  ContributionForm,
  ContributionMode
} from "../types/contribution";

type FieldSpec = { field: "prompt" | "correctAnswer"; label: string; placeholder: string };
type HintSpec  = { label: string; placeholder: string };
type ExerciseConfig = {
  description: string;
  fields: [FieldSpec, FieldSpec];
  hints: HintSpec[];
};

const EXERCISE_CONFIGS: Record<ContributionExerciseType, ExerciseConfig> = {
  build_sentence: {
    description: "Learner rearranges scrambled words to form the correct sentence.",
    fields: [
      { field: "correctAnswer", label: "Sentence", placeholder: "The sentence in the target language." },
      { field: "prompt",        label: "English translation", placeholder: "The English meaning shown as a prompt." }
    ],
    hints: [
      { label: "Word hint 1", placeholder: "e.g. word = its English meaning" },
      { label: "Word hint 2", placeholder: "Optional — another word = its meaning" },
      { label: "Word hint 3", placeholder: "Optional — another word = its meaning" }
    ]
  },
  flashcard: {
    description: "Learner flips a card to reveal the translation.",
    fields: [
      { field: "prompt",        label: "Front of card (English)", placeholder: "English word or phrase." },
      { field: "correctAnswer", label: "Back of card (translation)", placeholder: "Target language translation." }
    ],
    hints: [
      { label: "Usage note", placeholder: "Context, register, or memory tip." }
    ]
  },
  pronunciation: {
    description: "Learner reads and records the target phrase aloud.",
    fields: [
      { field: "correctAnswer", label: "Phrase to pronounce", placeholder: "Phrase in the target language." },
      { field: "prompt",        label: "English instruction", placeholder: "e.g. Say: Nice to meet you." }
    ],
    hints: [
      { label: "Pronunciation tip", placeholder: "How to pronounce a tricky sound." }
    ]
  },
  dialogue_turn: {
    description: "Learner picks the correct reply in a short conversation.",
    fields: [
      { field: "prompt",        label: "Conversation context", placeholder: "What was said (target language + gloss)." },
      { field: "correctAnswer", label: "Correct reply", placeholder: "The response the learner should produce." }
    ],
    hints: [
      { label: "Grammar hint",    placeholder: "Relevant grammar rule or form." },
      { label: "Vocabulary hint", placeholder: "Key vocabulary gloss." }
    ]
  },
  matching: {
    description: "Learner matches a word or phrase to its translation.",
    fields: [
      { field: "prompt",        label: "Term (English)", placeholder: "English word or phrase." },
      { field: "correctAnswer", label: "Match (target language)", placeholder: "Target language equivalent." }
    ],
    hints: [
      { label: "Context note", placeholder: "Usage context or grammatical note." }
    ]
  }
};

const EXERCISE_TYPE_LABELS: Record<ContributionExerciseType, string> = {
  build_sentence: "Build Sentence",
  flashcard:      "Flashcard",
  pronunciation:  "Pronunciation",
  dialogue_turn:  "Dialogue",
  matching:       "Matching"
};

function makeInitialForm(language: string): ContributionForm {
  return {
    mode: "idea",
    ideaTitle: "",
    ideaBody: "",
    exerciseLanguage: language,
    category: "",
    exerciseType: "build_sentence",
    difficulty: "a1",
    prompt: "",
    correctAnswer: "",
    hint1: "",
    hint2: "",
    hint3: "",
    culturalNote: "",
    audioUrl: "",
    imageUrl: ""
  };
}

type ContributionPanelProps = {
  language: string;
  languages: LanguageOption[];
  categories: CourseCategory[];
  onSubmit: (payload: CommunityExercisePayload) => Promise<{ message?: string }>;
};

export function ContributionPanel({ language, languages, categories, onSubmit }: ContributionPanelProps) {
  const [form, setForm] = useState<ContributionForm>(() => makeInitialForm(language));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function update(patch: Partial<ContributionForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function switchMode(mode: ContributionMode) {
    setForm((prev) => ({ ...prev, mode }));
    setMessage("");
  }

  function switchExerciseType(exerciseType: ContributionExerciseType) {
    setForm((prev) => ({
      ...prev,
      exerciseType,
      prompt: "",
      correctAnswer: "",
      hint1: "",
      hint2: "",
      hint3: ""
    }));
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      let payload: CommunityExercisePayload;

      if (form.mode === "idea") {
        if (!form.ideaTitle.trim() || !form.ideaBody.trim()) {
          setMessage("Please fill in the title and describe your idea.");
          return;
        }
        payload = {
          language,
          category: "general",
          prompt: form.ideaTitle.trim(),
          correctAnswer: form.ideaBody.trim(),
          hints: [],
          difficulty: "a1",
          audioUrl: "",
          imageUrl: "",
          culturalNote: "",
          exerciseType: "general_idea"
        };
      } else {
        if (!form.category) {
          setMessage("Choose a category.");
          return;
        }
        if (!form.prompt.trim() || !form.correctAnswer.trim()) {
          setMessage("Both exercise fields are required.");
          return;
        }
        payload = {
          language: form.exerciseLanguage || language,
          category: form.category,
          prompt: form.prompt.trim(),
          correctAnswer: form.correctAnswer.trim(),
          hints: [form.hint1, form.hint2, form.hint3].map((h) => h.trim()).filter(Boolean),
          difficulty: form.difficulty,
          audioUrl: form.audioUrl.trim(),
          imageUrl: form.imageUrl.trim(),
          culturalNote: form.culturalNote.trim(),
          exerciseType: form.exerciseType
        };
      }

      const result = await onSubmit(payload);
      setMessage(result?.message || "Submitted for moderation — thank you!");
      setForm((prev) => ({
        ...makeInitialForm(language),
        mode: prev.mode,
        exerciseLanguage: prev.exerciseLanguage,
        category: prev.category,
        exerciseType: prev.exerciseType,
        difficulty: prev.difficulty
      }));
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Could not submit. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const config = EXERCISE_CONFIGS[form.exerciseType];

  return (
    <section className="panel contribution-panel">
      <div className="section-heading">
        <div>
          <h2>Contribute</h2>
          <p className="subtitle">Share an idea or submit an exercise for moderation.</p>
        </div>
      </div>

      {/* Mode selector */}
      <div className="contribute-mode-selector">
        <button
          type="button"
          className={`contribute-mode-btn${form.mode === "idea" ? " active" : ""}`}
          onClick={() => switchMode("idea")}
        >
          General Idea
        </button>
        <button
          type="button"
          className={`contribute-mode-btn${form.mode === "exercise" ? " active" : ""}`}
          onClick={() => switchMode("exercise")}
        >
          Exercise
        </button>
      </div>

      <form className="settings-grid contribute-form" onSubmit={submit}>

        {form.mode === "idea" ? (
          <>
            <label className="wide-label">
              Title
              <input
                type="text"
                value={form.ideaTitle}
                onChange={(e) => update({ ideaTitle: e.target.value })}
                placeholder="What's the idea in one line?"
                required
              />
            </label>
            <label className="wide-label">
              Idea
              <textarea
                value={form.ideaBody}
                onChange={(e) => update({ ideaBody: e.target.value })}
                placeholder="Describe the idea. What should change or be added? Why would it help learners?"
                rows={5}
                required
              />
            </label>
          </>
        ) : (
          <>
            {/* Exercise type picker */}
            <div className="wide-label">
              <span className="field-label">Exercise type</span>
              <div className="exercise-type-picker">
                {(Object.keys(EXERCISE_CONFIGS) as ContributionExerciseType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`exercise-type-btn${form.exerciseType === type ? " active" : ""}`}
                    onClick={() => switchExerciseType(type)}
                  >
                    {EXERCISE_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <p className="subtitle">{config.description}</p>
            </div>

            {/* Language + Category + Difficulty row */}
            <label>
              Language
              <select
                value={form.exerciseLanguage}
                onChange={(e) => update({ exerciseLanguage: e.target.value })}
              >
                {languages.map((lang) => (
                  <option key={lang.id} value={lang.id}>{lang.label}</option>
                ))}
              </select>
            </label>

            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => update({ category: e.target.value })}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </label>

            <label>
              Difficulty
              <select
                value={form.difficulty}
                onChange={(e) => update({ difficulty: e.target.value })}
              >
                <option value="a1">A1 — Beginner</option>
                <option value="a2">A2 — Elementary</option>
                <option value="b1">B1 — Intermediate</option>
                <option value="b2">B2 — Upper Intermediate</option>
              </select>
            </label>

            {/* Dynamic content fields */}
            {config.fields.map((spec) => (
              <label key={spec.field} className="wide-label">
                {spec.label}
                <input
                  type="text"
                  value={form[spec.field]}
                  onChange={(e) => update({ [spec.field]: e.target.value })}
                  placeholder={spec.placeholder}
                  required
                />
              </label>
            ))}

            {/* Hints */}
            {config.hints.map((hint, i) => {
              const key = `hint${i + 1}` as "hint1" | "hint2" | "hint3";
              return (
                <label key={key}>
                  {hint.label}
                  <input
                    type="text"
                    value={form[key]}
                    onChange={(e) => update({ [key]: e.target.value })}
                    placeholder={hint.placeholder}
                  />
                </label>
              );
            })}

            {/* Optional extras */}
            <label className="wide-label">
              Cultural note <span className="field-optional">(optional)</span>
              <input
                type="text"
                value={form.culturalNote}
                onChange={(e) => update({ culturalNote: e.target.value })}
                placeholder="Context, etiquette, regional usage, or history."
              />
            </label>
          </>
        )}

        <div className="wide-label contribute-submit-row">
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Submitting…" : form.mode === "idea" ? "Submit Idea" : "Submit Exercise"}
          </button>
        </div>
      </form>

      {message ? <div className="status">{message}</div> : null}
    </section>
  );
}
