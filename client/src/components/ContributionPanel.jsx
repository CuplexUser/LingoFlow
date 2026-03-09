import { useMemo, useState } from "react";

const INITIAL_FORM = {
  category: "",
  ideaType: "content",
  title: "",
  learnerNeed: "",
  proposal: "",
  exampleContent: "",
  implementationNotes: "",
  difficulty: "a1",
  audioUrl: "",
  imageUrl: "",
  culturalNote: "",
  exerciseType: "build_sentence"
};

export function ContributionPanel({ language, categories, onSubmit }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const availableCategories = useMemo(
    () => categories.filter((category) => category.unlocked || category.recommended),
    [categories]
  );

  async function submit(event) {
    event.preventDefault();
    if (!language || !form.category || !form.title.trim() || !form.proposal.trim()) {
      setMessage("Choose a category and fill in the idea title and proposal.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const notes = [
        `Idea type: ${form.ideaType}`,
        form.learnerNeed.trim() ? `Learner need: ${form.learnerNeed.trim()}` : "",
        form.implementationNotes.trim() ? `Implementation notes: ${form.implementationNotes.trim()}` : ""
      ].filter(Boolean);

      const result = await onSubmit({
        language,
        category: form.category,
        prompt: form.title.trim(),
        correctAnswer: form.proposal.trim(),
        hints: notes,
        difficulty: form.difficulty,
        audioUrl: form.audioUrl.trim(),
        imageUrl: form.imageUrl.trim(),
        culturalNote: [
          form.culturalNote.trim(),
          form.exampleContent.trim() ? `Example content: ${form.exampleContent.trim()}` : ""
        ].filter(Boolean).join("\n\n"),
        exerciseType: form.exerciseType
      });
      setMessage(result?.message || "Idea submitted for moderation.");
      setForm((prev) => ({ ...INITIAL_FORM, category: prev.category }));
    } catch (error) {
      setMessage(error.message || "Could not submit this idea.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel contribution-panel">
      <div className="section-heading">
        <div>
          <h2>Contribute Idea</h2>
          <p className="subtitle">Share content, lesson-flow, media, or culture ideas for moderation.</p>
        </div>
      </div>
      <form className="settings-grid" onSubmit={submit}>
        <label>
          Category
          <select
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
          >
            <option value="">Select category</option>
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </label>

        <label>
          Idea Type
          <select
            value={form.ideaType}
            onChange={(event) => setForm((prev) => ({ ...prev, ideaType: event.target.value }))}
          >
            <option value="content">Content Idea</option>
            <option value="exercise">Exercise Format</option>
            <option value="media">Media Addition</option>
            <option value="culture">Cultural Note</option>
            <option value="product">Product Suggestion</option>
          </select>
        </label>

        <label>
          Difficulty
          <select
            value={form.difficulty}
            onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value }))}
          >
            <option value="a1">A1</option>
            <option value="a2">A2</option>
            <option value="b1">B1</option>
            <option value="b2">B2</option>
          </select>
        </label>

        <label>
          Exercise Type
          <select
            value={form.exerciseType}
            onChange={(event) => setForm((prev) => ({ ...prev, exerciseType: event.target.value }))}
          >
            <option value="build_sentence">Build Sentence</option>
            <option value="dialogue_turn">Dialogue</option>
            <option value="flashcard">Flashcard</option>
            <option value="matching">Matching</option>
            <option value="pronunciation">Pronunciation</option>
          </select>
        </label>

        <label className="wide-label">
          Idea Title
          <textarea
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Example: Add a fika small-talk lesson with audio and etiquette notes."
          />
        </label>

        <label className="wide-label">
          Proposal
          <textarea
            value={form.proposal}
            onChange={(event) => setForm((prev) => ({ ...prev, proposal: event.target.value }))}
            placeholder="Describe what should be added or changed, and what the learner would see."
          />
        </label>

        <label className="wide-label">
          Learner Need
          <textarea
            value={form.learnerNeed}
            onChange={(event) => setForm((prev) => ({ ...prev, learnerNeed: event.target.value }))}
            placeholder="What problem would this idea solve for learners?"
          />
        </label>

        <label className="wide-label">
          Example Content
          <textarea
            value={form.exampleContent}
            onChange={(event) => setForm((prev) => ({ ...prev, exampleContent: event.target.value }))}
            placeholder="Optional sample prompt, dialogue line, vocabulary list, or scenario."
          />
        </label>

        <label className="wide-label">
          Implementation Notes
          <textarea
            value={form.implementationNotes}
            onChange={(event) => setForm((prev) => ({ ...prev, implementationNotes: event.target.value }))}
            placeholder="Optional notes about UI, flow, moderation, or rollout."
          />
        </label>

        <label>
          Audio URL
          <input
            value={form.audioUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, audioUrl: event.target.value }))}
            placeholder="Optional external or local audio URL"
          />
        </label>

        <label>
          Image URL
          <input
            value={form.imageUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
            placeholder="Optional image URL"
          />
        </label>

        <label className="wide-label">
          Cultural Note
          <textarea
            value={form.culturalNote}
            onChange={(event) => setForm((prev) => ({ ...prev, culturalNote: event.target.value }))}
            placeholder="Optional context like etiquette, customs, history, or regional nuance."
          />
        </label>

        <div className="hero-actions">
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Submitting..." : "Submit Idea"}
          </button>
        </div>
      </form>
      {message ? <div className="status">{message}</div> : null}
    </section>
  );
}
