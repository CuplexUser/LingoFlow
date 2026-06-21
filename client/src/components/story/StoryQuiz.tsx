import { useState } from "react";
import type { StoryQuestion, StoryCompletionResult } from "../../types/story";

type StoryQuizProps = {
  questions: StoryQuestion[];
  // null until the learner submits; once present the quiz reveals correctness.
  result: StoryCompletionResult | null;
  submitting: boolean;
  onSubmit: (answers: number[]) => void;
  onContinue: () => void;
};

export function StoryQuiz({ questions, result, submitting, onSubmit, onContinue }: StoryQuizProps) {
  const [answers, setAnswers] = useState<number[]>(() => questions.map(() => -1));
  const submitted = Boolean(result);
  const allAnswered = answers.every((answer) => answer >= 0);

  function choose(questionIndex: number, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  }

  return (
    <div className="sr-quiz">
      <h3 className="sr-quiz-title">Quick check</h3>
      <p className="sr-quiz-sub">
        {submitted
          ? `You got ${result?.quizScore} of ${result?.quizTotal} right.`
          : "Answer a few questions about the story before you finish."}
      </p>

      {questions.map((question, questionIndex) => {
        const correctIndex = result?.correctAnswers[questionIndex];
        const explanation = result?.explanations[questionIndex];
        return (
          <div className="sr-quiz-q" key={questionIndex}>
            <p className={`sr-quiz-stem${question.stemLang === "target" ? " target" : ""}`}>
              {question.stem}
            </p>
            <div className="sr-quiz-options">
              {question.options.map((option, optionIndex) => {
                const selected = answers[questionIndex] === optionIndex;
                const isCorrect = submitted && optionIndex === correctIndex;
                const isWrong = submitted && selected && optionIndex !== correctIndex;
                const className = [
                  "sr-quiz-option",
                  question.optionsLang === "target" ? "target" : "",
                  selected ? "selected" : "",
                  isCorrect ? "correct" : "",
                  isWrong ? "wrong" : ""
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    className={className}
                    aria-pressed={selected}
                    disabled={submitted}
                    onClick={() => choose(questionIndex, optionIndex)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {submitted && explanation ? <p className="sr-quiz-explain">{explanation}</p> : null}
          </div>
        );
      })}

      {submitted ? (
        <button type="button" className="sr-action primary" onClick={onContinue}>
          See your reward
        </button>
      ) : (
        <button
          type="button"
          className="sr-action primary"
          disabled={!allAnswered || submitting}
          onClick={() => onSubmit(answers)}
        >
          {submitting ? "Checking…" : "Check answers"}
        </button>
      )}
    </div>
  );
}
