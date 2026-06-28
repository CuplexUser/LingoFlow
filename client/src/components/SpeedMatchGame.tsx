import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { MatchingPair } from "../types/session";

type SpeedMatchGameProps = {
  language: string;
  languageLabel?: string;
  onExit: () => void;
};

type Phase = "loading" | "error" | "ready" | "running" | "break" | "gameover";

const PAIRS_PER_RUN = 6;
const RUN_SECONDS = 30;
const BREAK_SECONDS = 3;
const MIN_POOL = PAIRS_PER_RUN;

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

type RunCard = {
  key: string;
  prompt: string;
  answer: string;
};

export function SpeedMatchGame({ language, languageLabel, onExit }: SpeedMatchGameProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [highscore, setHighscore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);

  const [score, setScore] = useState(0);
  const [runNumber, setRunNumber] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(RUN_SECONDS);
  const [breakLeft, setBreakLeft] = useState(BREAK_SECONDS);

  // Current run state
  const [prompts, setPrompts] = useState<RunCard[]>([]);
  const [answers, setAnswers] = useState<RunCard[]>([]);
  const [matchedKeys, setMatchedKeys] = useState<Set<string>>(new Set());
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [wrongKey, setWrongKey] = useState<string | null>(null);

  // Pool cursor lives in refs so timers always read the latest values.
  const poolRef = useRef<MatchingPair[]>([]);
  const cursorRef = useRef(0);
  const scoreRef = useRef(0);
  const submittedRef = useRef(false);
  const runTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mirror the score into a ref so timer/effect callbacks read the latest value.
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const clearTimers = useCallback(() => {
    if (runTimerRef.current) clearInterval(runTimerRef.current);
    if (breakTimerRef.current) clearInterval(breakTimerRef.current);
    runTimerRef.current = null;
    breakTimerRef.current = null;
  }, []);

  // Draw the next PAIRS_PER_RUN unique pairs, cycling the shuffled pool.
  const drawRun = useCallback((): MatchingPair[] => {
    const pool = poolRef.current;
    if (pool.length <= PAIRS_PER_RUN) return shuffle(pool).slice(0, PAIRS_PER_RUN);
    if (cursorRef.current + PAIRS_PER_RUN > pool.length) {
      poolRef.current = shuffle(pool);
      cursorRef.current = 0;
    }
    const slice = poolRef.current.slice(cursorRef.current, cursorRef.current + PAIRS_PER_RUN);
    cursorRef.current += PAIRS_PER_RUN;
    return slice;
  }, []);

  const submitScore = useCallback(
    async (finalScore: number) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      try {
        const result = await api.submitSpeedMatchScore(language, finalScore);
        setHighscore(result.highscore);
        setIsNewBest(result.isNewBest);
      } catch (_error) {
        // Keep the locally known best if the save fails.
        setHighscore((prev) => Math.max(prev, finalScore));
      }
    },
    [language]
  );

  const endGame = useCallback(() => {
    clearTimers();
    setPhase("gameover");
    void submitScore(scoreRef.current);
  }, [clearTimers, submitScore]);

  const startRun = useCallback(() => {
    clearTimers();
    const pairs = drawRun();
    const cards: RunCard[] = pairs.map((pair, index) => ({
      key: `${index}-${pair.prompt}`,
      prompt: pair.prompt,
      answer: pair.answer
    }));
    setPrompts(shuffle(cards));
    setAnswers(shuffle(cards));
    setMatchedKeys(new Set());
    setSelectedPrompt(null);
    setWrongKey(null);
    setSecondsLeft(RUN_SECONDS);
    setRunNumber((prev) => prev + 1);
    setPhase("running");
    runTimerRef.current = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
  }, [clearTimers, drawRun]);

  const startBreak = useCallback(() => {
    clearTimers();
    setBreakLeft(BREAK_SECONDS);
    setPhase("break");
    breakTimerRef.current = setInterval(() => {
      setBreakLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
  }, [clearTimers]);

  // Run timer reached zero before the run was cleared — the game ends.
  useEffect(() => {
    if (phase === "running" && secondsLeft === 0) endGame();
  }, [phase, secondsLeft, endGame]);

  // Break countdown finished — start the next run.
  useEffect(() => {
    if (phase === "break" && breakLeft === 0) startRun();
  }, [phase, breakLeft, startRun]);

  const beginGame = useCallback(() => {
    submittedRef.current = false;
    cursorRef.current = 0;
    poolRef.current = shuffle(poolRef.current);
    setScore(0);
    setIsNewBest(false);
    setRunNumber(0);
    startRun();
  }, [startRun]);

  // Load the word pool once.
  useEffect(() => {
    let cancelled = false;
    api
      .getSpeedMatchPool(language)
      .then((data) => {
        if (cancelled) return;
        poolRef.current = data.pairs || [];
        setHighscore(data.highscore || 0);
        setPhase(poolRef.current.length >= MIN_POOL ? "ready" : "error");
        if (poolRef.current.length < MIN_POOL) {
          setError("Not enough words yet. Mark some flashcards as Known or bookmark words, then try again.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not load the Speed Match words. Please try again.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Tidy up timers when the component unmounts.
  useEffect(() => clearTimers, [clearTimers]);

  const handlePromptClick = useCallback(
    (card: RunCard) => {
      if (phase !== "running" || matchedKeys.has(card.key)) return;
      setSelectedPrompt((prev) => (prev === card.key ? null : card.key));
      setWrongKey(null);
    },
    [phase, matchedKeys]
  );

  const handleAnswerClick = useCallback(
    (card: RunCard) => {
      if (phase !== "running" || matchedKeys.has(card.key) || !selectedPrompt) return;
      if (card.key === selectedPrompt) {
        const nextMatched = new Set(matchedKeys);
        nextMatched.add(card.key);
        setMatchedKeys(nextMatched);
        setSelectedPrompt(null);
        setScore((prev) => prev + 1);
        if (nextMatched.size === prompts.length) {
          // Run cleared — short break, then the next run.
          setTimeout(() => startBreak(), 250);
        }
      } else {
        // Wrong pairing — brief shake, no penalty.
        setWrongKey(card.key);
        setSelectedPrompt(null);
        setTimeout(() => setWrongKey((prev) => (prev === card.key ? null : prev)), 350);
      }
    },
    [phase, matchedKeys, selectedPrompt, prompts.length, startBreak]
  );

  const timerPercent = useMemo(
    () => Math.max(0, Math.min(100, (secondsLeft / RUN_SECONDS) * 100)),
    [secondsLeft]
  );

  const heading = languageLabel ? `Speed Match · ${languageLabel}` : "Speed Match";

  return (
    <section className="panel speed-match">
      <div className="speed-match-header">
        <div>
          <p className="eyebrow">Practice Mode</p>
          <h2>{heading}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onExit}>
          Exit
        </button>
      </div>

      {phase === "loading" ? <p className="speed-match-status">Loading words…</p> : null}

      {phase === "error" ? (
        <div className="speed-match-status">
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={onExit}>
            Back to Practice
          </button>
        </div>
      ) : null}

      {phase === "ready" ? (
        <div className="speed-match-intro">
          <p>
            Match {PAIRS_PER_RUN} word pairs before the {RUN_SECONDS}-second timer runs out. Clear a
            run and the next one starts right away. The game ends the moment a run beats the clock.
          </p>
          <p className="speed-match-best">Personal best: <strong>{highscore}</strong></p>
          <button className="primary-button" type="button" onClick={beginGame}>
            Start
          </button>
        </div>
      ) : null}

      {phase === "running" ? (
        <>
          <div className="speed-match-stats">
            <span>Run {runNumber}</span>
            <span>Score {score}</span>
            <span>Best {highscore}</span>
          </div>
          <div className="speed-match-timer">
            <div className="meter speed-match-meter">
              <div style={{ width: `${timerPercent}%` }} />
            </div>
            <span className="speed-match-seconds">{secondsLeft}s left</span>
          </div>
          <div className="speed-match-board">
            <div className="speed-match-column">
              {prompts.map((card) => {
                const matched = matchedKeys.has(card.key);
                const selected = selectedPrompt === card.key;
                return (
                  <button
                    key={`p-${card.key}`}
                    type="button"
                    className={`speed-match-card${matched ? " matched" : ""}${selected ? " selected" : ""}`}
                    disabled={matched}
                    onClick={() => handlePromptClick(card)}
                  >
                    {card.prompt}
                  </button>
                );
              })}
            </div>
            <div className="speed-match-column">
              {answers.map((card) => {
                const matched = matchedKeys.has(card.key);
                const wrong = wrongKey === card.key;
                return (
                  <button
                    key={`a-${card.key}`}
                    type="button"
                    className={`speed-match-card${matched ? " matched" : ""}${wrong ? " wrong" : ""}`}
                    disabled={matched}
                    onClick={() => handleAnswerClick(card)}
                  >
                    {card.answer}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {phase === "break" ? (
        <div className="speed-match-break">
          <p className="speed-match-break-count">{breakLeft}</p>
          <p>Run cleared! Score {score}. Next run starting…</p>
        </div>
      ) : null}

      {phase === "gameover" ? (
        <div className="speed-match-intro">
          <h3>Time&apos;s up!</h3>
          <p className="speed-match-final">
            You matched <strong>{score}</strong> word{score === 1 ? "" : "s"} across {runNumber} run
            {runNumber === 1 ? "" : "s"}.
          </p>
          {isNewBest ? (
            <p className="speed-match-newbest">New best! 🎉</p>
          ) : (
            <p className="speed-match-best">Personal best: <strong>{highscore}</strong></p>
          )}
          <div className="speed-match-actions">
            <button className="primary-button" type="button" onClick={beginGame}>
              Play again
            </button>
            <button className="ghost-button" type="button" onClick={onExit}>
              Back to Practice
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
