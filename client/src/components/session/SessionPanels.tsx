import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { api } from "../../api";
import type {
  BuildSentenceQuestion,
  ClozeSentenceQuestion,
  FlashcardQuestion,
  MatchingQuestion,
  PracticeWordsQuestion,
  SessionFeedback
} from "../../types/session";

type MultipleChoicePanelProps = {
  options: string[];
  selectedOption: string;
  onSelect: (option: string) => void;
  onSpeakOption?: (option: string) => void;
  withSpeakButton?: boolean;
};

export function MultipleChoicePanel({
  options,
  selectedOption,
  onSelect,
  onSpeakOption,
  withSpeakButton = false
}: MultipleChoicePanelProps) {
  return (
    <div className="options">
      {options.map((option, optionIndex) => (
        <div key={option} className="option-row">
          <button
            className={`option ${selectedOption === option ? "selected" : ""}`}
            onClick={() => onSelect(option)}
          >
            <span className="option-key" aria-hidden="true">{optionIndex + 1}</span>
            {option}
          </button>
          {withSpeakButton && onSpeakOption ? (
            <button type="button" className="speak-button" onClick={() => onSpeakOption(option)}>
              Speak
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

type ClozeSentencePanelProps = {
  question: ClozeSentenceQuestion;
  selectedOption: string;
  onSelect: (option: string) => void;
};

export function ClozeSentencePanel({ question, selectedOption, onSelect }: ClozeSentencePanelProps) {
  return (
    <>
      {question.translation && (
        <div className="cloze-translation">{question.translation}</div>
      )}
      <div className="tokens">
        {question.clozeOptions.map((token) => (
          <button
            key={token}
            className={`token ${selectedOption === token ? "selected" : ""}`}
            onClick={() => onSelect(token)}
          >
            {token}
          </button>
        ))}
      </div>
    </>
  );
}

export const SPEED_OPTIONS = [0.5, 0.75, 1] as const;
export type ListenSpeed = typeof SPEED_OPTIONS[number];

type SpeedPickerProps = {
  rate: ListenSpeed;
  onChange: (rate: ListenSpeed) => void;
};

export function SpeedPicker({ rate, onChange }: SpeedPickerProps) {
  return (
    <div className="speed-picker">
      {SPEED_OPTIONS.map((s) => (
        <button
          key={s}
          type="button"
          className={`speed-btn${rate === s ? " active" : ""}`}
          onClick={() => onChange(s)}
        >
          {s === 1 ? "1×" : `${s}×`}
        </button>
      ))}
    </div>
  );
}

type BuildSentencePanelProps = {
  dictation: boolean;
  reversed?: boolean;
  question: BuildSentenceQuestion;
  builtSentence: string;
  builtWords: string[];
  selectedTokenIndexes: number[];
  nextHintWordIndex?: number;
  onHint: () => void;
  onTokenSelect: (tokenIndex: number) => void;
  onBuiltWordDragStart: (wordIndex: number) => void;
  onBuiltWordDrop: (wordIndex: number) => void;
  onBuiltWordDragEnd: () => void;
};

export function BuildSentencePanel({
  dictation,
  reversed,
  question,
  builtSentence,
  builtWords,
  selectedTokenIndexes,
  nextHintWordIndex,
  onHint,
  onTokenSelect,
  onBuiltWordDragStart,
  onBuiltWordDrop,
  onBuiltWordDragEnd
}: BuildSentencePanelProps) {
  const hintLabel = dictation ? "Play Audio" : reversed ? "Listen" : "Hint: Listen Translation";
  const hintAriaLabel = dictation ? "Listen to sentence audio" : reversed ? "Listen to sentence" : "Listen to the prompt translation";
  return (
    <>
      <div className="build-hints">
        <button
          type="button"
          className="speak-button"
          onClick={onHint}
          aria-label={hintAriaLabel}
        >
          {hintLabel}
        </button>
        {question.hints?.map((hint, i) => (
          <span key={i} className="hint-chip">{hint}</span>
        ))}
      </div>

      <div className="build-target">
        {builtSentence ? (
          <div className="built-words">
            {builtWords.map((word, selectedWordIndex) => (
              <span
                key={`${word}-${selectedWordIndex}`}
                className="built-word-chip"
                draggable
                onDragStart={() => onBuiltWordDragStart(selectedWordIndex)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => onBuiltWordDrop(selectedWordIndex)}
                onDragEnd={onBuiltWordDragEnd}
              >
                {word}
              </span>
            ))}
          </div>
        ) : (
          dictation ? "Listen and build the sentence" : "Tap words to build your sentence"
        )}
      </div>
      <div className="tokens">
        {question.tokens.map((token, tokenIndex) => {
          const active = selectedTokenIndexes.includes(tokenIndex);
          const isNextHint = nextHintWordIndex !== undefined &&
            tokenIndex === nextHintWordIndex && !active;
          return (
            <button
              type="button"
              key={`${token}-${tokenIndex}`}
              className={`token ${active ? "selected" : ""} ${isNextHint ? "next-hint" : ""}`}
              onClick={() => onTokenSelect(tokenIndex)}
            >
              {token}
            </button>
          );
        })}
      </div>
    </>
  );
}

type FlashcardPanelProps = {
  question: FlashcardQuestion;
  flashcardRevealed: boolean;
  onToggleReveal: () => void;
  onNeedReview: () => void;
  onKnown: () => void;
  onSpeak?: () => void;
};

export function FlashcardPanel({
  question,
  flashcardRevealed,
  onToggleReveal,
  onNeedReview,
  onKnown,
  onSpeak
}: FlashcardPanelProps) {
  return (
    <div className="flashcard-shell">
      <button className="flashcard" type="button" onClick={onToggleReveal}>
        <strong>{flashcardRevealed ? question.back || question.answer : question.front || question.prompt}</strong>
        <span>{flashcardRevealed ? "Back" : "Front"} side</span>
      </button>
      <div className="hero-actions">
        <button className="ghost-button" type="button" onClick={onNeedReview} disabled={!flashcardRevealed}>
          Need Review
        </button>
        <button className="primary-button" type="button" onClick={onKnown} disabled={!flashcardRevealed}>
          I Knew This
        </button>
        {onSpeak ? (
          <button
            className="speak-button"
            type="button"
            onClick={onSpeak}
            disabled={!flashcardRevealed}
            title="Listen to answer"
          >
            Listen
          </button>
        ) : null}
      </div>
    </div>
  );
}

type MatchingDragPayload = {
  answer: string;
  fromPrompt: string;
};

type MatchingPanelProps = {
  question: MatchingQuestion;
  matchingPromptOrder: string[];
  matchingAnswerOrder: string[];
  matchingPairs: Array<{ prompt: string; answer: string }>;
  onReadDragPayload: (event: DragEvent<HTMLElement>) => MatchingDragPayload | null;
  onApplyAssignment: (prompt: string, answer: string, fromPrompt?: string) => void;
  onStartDrag: (event: DragEvent<HTMLElement>, answer: string, fromPrompt?: string) => void;
  onClearAssignment: (prompt: string) => void;
};

export function MatchingPanel({
  question,
  matchingPromptOrder,
  matchingAnswerOrder,
  matchingPairs,
  onReadDragPayload,
  onApplyAssignment,
  onStartDrag,
  onClearAssignment
}: MatchingPanelProps) {
  const orderedPrompts = matchingPromptOrder.length
    ? matchingPromptOrder
    : question.pairs.map((pair) => pair.prompt);
  const orderedAnswers = matchingAnswerOrder.length
    ? matchingAnswerOrder
    : question.pairs.map((pair) => pair.answer);
  const availableAnswers = orderedAnswers.filter(
    (answer) => !matchingPairs.some((entry) => entry.answer === answer)
  );

  return (
    <div className="matching-shell">
      <p className="matching-instructions">
        Drag each translation piece onto the correct prompt slot.
      </p>
      <div className="matching-puzzle">
        <div className="puzzle-board">
          {orderedPrompts.map((prompt) => {
            const assigned = matchingPairs.find((entry) => entry.prompt === prompt)?.answer || "";
            const filled = Boolean(assigned);
            return (
              <div className="puzzle-row" key={prompt}>
                <div className="puzzle-piece puzzle-prompt">{prompt}</div>
                <div
                  className={`puzzle-slot ${filled ? "filled" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const payload = onReadDragPayload(event);
                    if (!payload) return;
                    onApplyAssignment(prompt, payload.answer, payload.fromPrompt);
                  }}
                >
                  {filled ? (
                    <>
                      <div
                        className="puzzle-piece puzzle-answer"
                        draggable
                        onDragStart={(event) => onStartDrag(event, assigned, prompt)}
                      >
                        {assigned}
                      </div>
                      <button
                        className="ghost-button puzzle-clear"
                        type="button"
                        onClick={() => onClearAssignment(prompt)}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <span className="puzzle-placeholder">Drop answer here</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="puzzle-pool"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const payload = onReadDragPayload(event);
            if (!payload?.fromPrompt) return;
            onClearAssignment(payload.fromPrompt);
          }}
        >
          {availableAnswers.map((answer) => (
            <div
              key={answer}
              className="puzzle-piece puzzle-answer"
              draggable
              onDragStart={(event) => onStartDrag(event, answer, "")}
            >
              {answer}
            </div>
          ))}
          {availableAnswers.length === 0 ? (
            <span className="puzzle-pool-empty">All answers placed.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type TranscriptExercisePanelProps = {
  actionButtons: ReactNode[];
  transcript: string;
};

export function TranscriptExercisePanel({
  actionButtons,
  transcript,
}: TranscriptExercisePanelProps) {
  return (
    <div className="pronunciation-shell">
      <div className="hero-actions">{actionButtons}</div>
      <label>
        Transcript
        <input
          value={transcript}
          readOnly
          placeholder="Your speech will appear here"
        />
      </label>
    </div>
  );
}

type AudioActionPanelProps = {
  onPlay: () => void;
};

export function AudioActionPanel({ onPlay }: AudioActionPanelProps) {
  return (
    <div className="pronunciation-shell">
      <div className="hero-actions">
        <button
          className="speak-button"
          type="button"
          onClick={onPlay}
        >
          Play Audio
        </button>
      </div>
    </div>
  );
}

type PracticeWordsPanelProps = {
  question: PracticeWordsQuestion;
  practiceLeftOrder: string[];
  practiceRightOrder: string[];
  practiceWordMatches: Array<{ left: string; right: string }>;
  practiceSelection: { left: string; right: string };
  practiceFeedback: string;
  onPick: (side: "left" | "right", value: string) => void;
};

export function PracticeWordsPanel({
  question,
  practiceLeftOrder,
  practiceRightOrder,
  practiceWordMatches,
  practiceSelection,
  practiceFeedback,
  onPick
}: PracticeWordsPanelProps) {
  const orderedLefts = practiceLeftOrder.length
    ? practiceLeftOrder
    : question.pairs.map((pair) => pair.left);
  const orderedRights = practiceRightOrder.length
    ? practiceRightOrder
    : question.pairs.map((pair) => pair.right);

  return (
    <div className="matching-shell practice-words">
      <p className="matching-instructions">
        Tap a word on the left, then its translation on the right. Correct pairs stay locked.
      </p>
      <div className="practice-words-grid">
        <div className="practice-words-column">
          {orderedLefts.map((left) => {
            const matched = practiceWordMatches.find((pair) => pair.left === left);
            const selected = practiceSelection.left === left;
            return (
              <button
                key={left}
                className={`puzzle-piece practice-word ${matched ? "filled" : ""} ${selected ? "selected" : ""}`}
                type="button"
                onClick={() => {
                  if (matched) return;
                  onPick("left", left);
                }}
              >
                {left}
                {matched ? <span className="practice-word-match">✓</span> : null}
              </button>
            );
          })}
        </div>
        <div className="practice-words-column">
          {orderedRights.map((right) => {
            const matched = practiceWordMatches.find((pair) => pair.right === right);
            const selected = practiceSelection.right === right;
            return (
              <button
                key={right}
                className={`puzzle-piece practice-word ${matched ? "filled" : ""} ${selected ? "selected" : ""}`}
                type="button"
                onClick={() => {
                  if (matched) return;
                  onPick("right", right);
                }}
              >
                {right}
                {matched ? <span className="practice-word-match">✓</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {practiceFeedback ? <p className="lock-note">{practiceFeedback}</p> : null}
    </div>
  );
}

type HintKind = "grammar" | "glossary";
type WordHintEntry = { text: string; kind: HintKind };

function parseWordHints(hints: string[]): Map<string, WordHintEntry> {
  const map = new Map<string, WordHintEntry>();
  const re = /'([^']+)'\s*=\s*([^;.']+)/g;
  for (const hint of hints) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(hint)) !== null) {
      const phrase = match[1].trim();
      // Strip grammatical notes after em-dash (e.g., "would prefer — conditional")
      const value = match[2].trim().replace(/\s*[—–-]\s*.+$/, "").trim();
      for (const word of phrase.toLowerCase().split(/\s+/)) {
        if (!map.has(word)) map.set(word, { text: value, kind: "grammar" });
      }
    }
  }
  return map;
}

function buildWordHintMap(
  hints: string[],
  wordGlossary: Record<string, string> | undefined
): Map<string, WordHintEntry> {
  const map = new Map<string, WordHintEntry>();
  if (wordGlossary) {
    for (const [word, gloss] of Object.entries(wordGlossary)) {
      map.set(word.toLowerCase(), { text: gloss, kind: "glossary" });
    }
  }
  for (const [word, entry] of parseWordHints(hints)) {
    map.set(word, entry);
  }
  return map;
}

function normalizeWord(word: string): string {
  return word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLowerCase();
}

function HoverWordTip({ word, hint, kind }: { word: string; hint?: string; kind?: HintKind }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onEnter() {
    if (!hint) return;
    timer.current = setTimeout(() => setVisible(true), 700);
  }
  function onLeave() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  const kindClass = hint ? (kind === "grammar" ? " hover-word--grammar-hint" : " hover-word--glossary-hint") : "";

  return (
    <span
      className={`hover-word${hint ? " hover-word--has-hint" : ""}${kindClass}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {word}
      {visible && hint ? (
        <span className={`hover-word-tip hover-word-tip--${kind ?? "glossary"}`}>{hint}</span>
      ) : null}
    </span>
  );
}

type SourceTextWithHintsProps = {
  sourceText: string;
  hints: string[];
  wordGlossary?: Record<string, string>;
  language?: string;
};

export function SourceTextWithHints({ sourceText, hints, wordGlossary, language }: SourceTextWithHintsProps) {
  const [apiTranslations, setApiTranslations] = useState<Record<string, string>>({});
  const baseHints = useMemo(() => buildWordHintMap(hints, wordGlossary), [hints, wordGlossary]);

  useEffect(() => {
    if (!language) return;
    setApiTranslations({});
    const words = [...new Set(
      sourceText.trim().split(/\s+/).map(normalizeWord).filter((w) => w.length >= 2 && !baseHints.has(w))
    )];
    if (!words.length) return;
    let cancelled = false;
    api.fetchWordTranslations(language, words).then((result) => {
      if (!cancelled) setApiTranslations(result);
    });
    return () => { cancelled = true; };
  }, [sourceText, language, baseHints]);

  const wordHints = useMemo(() => {
    const merged = new Map(baseHints);
    for (const [word, text] of Object.entries(apiTranslations)) {
      if (!merged.has(word)) merged.set(word, { text, kind: "glossary" });
    }
    return merged;
  }, [baseHints, apiTranslations]);

  const sourceWords = sourceText.trim().split(/\s+/);
  const hasAnyHint = sourceWords.some((w) => wordHints.has(normalizeWord(w)));
  return (
    <>
      <div className="source-text-hints">
        {sourceWords.map((word, i) => {
          const entry = wordHints.get(normalizeWord(word));
          return <HoverWordTip key={i} word={word} hint={entry?.text} kind={entry?.kind} />;
        })}
      </div>
      {hasAnyHint ? <span className="source-text-hint-label">Hover a word for a hint</span> : null}
    </>
  );
}

type FeedbackPanelProps = {
  feedback: SessionFeedback | null;
  builtWords: string[];
  onReveal: () => void;
};

export function FeedbackPanel({ feedback, builtWords, onReveal }: FeedbackPanelProps) {
  if (!feedback) return null;

  return (
    <div className={`feedback ${feedback.type}`}>
      <strong>{feedback.message}</strong>
      <span>{feedback.hint}</span>
      {feedback.correctOption ? (
        <div className="expected-option">
          Correct answer:
          <div className="option correct-answer">{feedback.correctOption}</div>
        </div>
      ) : null}
      {feedback.answerWords ? (
        <div className="expected-words">
          {feedback.answerWords.map((word, wordIndex) => {
            const matched = builtWords[wordIndex] === word;
            return (
              <span
                key={`${word}-${wordIndex}`}
                className={`expected-word ${matched ? "matched" : "missing"}`}
              >
                {word}
              </span>
            );
          })}
        </div>
      ) : null}
      {feedback.showReveal ? (
        <button type="button" className="ghost-button" onClick={onReveal}>
          Reveal Answer
        </button>
      ) : null}
    </div>
  );
}
