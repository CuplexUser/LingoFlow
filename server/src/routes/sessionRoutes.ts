type ErrorType =
  | "none"
  | "missing_answer"
  | "word_order"
  | "missing_word"
  | "grammar_or_vocab"
  | "dictation_mismatch"
  | "cloze_choice"
  | "wrong_option";

type QuestionType =
  | "mc_sentence"
  | "build_sentence"
  | "cloze_sentence"
  | "dictation_sentence"
  | "dialogue_turn"
  | "roleplay"
  | "flashcard"
  | "matching"
  | "pronunciation"
  | "practice_speak"
  | "practice_listen"
  | "practice_words";

interface SessionQuestion {
  id: string;
  type: QuestionType;
  objective?: string;
  answer: string;
  acceptedAnswers?: string[];
  clozeAnswer?: string;
}

interface SessionAttempt {
  questionId?: string;
  builtSentence?: string;
  textAnswer?: string;
  selectedOption?: string;
  matchingPairs?: Array<{ prompt: string; answer: string }>;
  revealed?: boolean;
}

const PRACTICE_XP_BY_TYPE: Record<string, number> = {
  practice_listen: 10,
  practice_words: 5
};

function getPracticeXp(questions: SessionQuestion[], score: number): number {
  if (!Array.isArray(questions) || !questions.length) return 0;
  const types = new Set(questions.map((question) => question.type));
  if (types.size !== 1) return 0;
  const [type] = Array.from(types);
  if (type === "practice_speak") {
    return Math.max(0, Math.min(score, questions.length));
  }
  return PRACTICE_XP_BY_TYPE[type] || 0;
}

function registerSessionRoutes(
  app: any,
  deps: any
): void {
  const { requireAuth, database, generateSession, evaluateAttempt, calculateXp, crypto } = deps;

  app.post("/api/session/start", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const { language, category, count, mode } = req.body || {};
    if (!language || !category) {
      return res.status(400).json({ error: "language and category are required" });
    }

    database.pruneExpiredActiveSessions(userId, database.toIsoDate());
    const mastery = database.getCategoryMastery(userId, language, category);
    const settings = database.getSettings(userId);
    const recentAccuracy = database.getRecentCategoryAccuracy(userId, language, category, 5);
    const hints = database.getItemSelectionHints(userId, language, category, database.toIsoDate());
    const session = generateSession({
      language,
      category,
      mastery,
      recentAccuracy,
      selfRatedLevel: settings.selfRatedLevel,
      dueItemIds: hints.dueItemIds,
      weakItemIds: hints.weakItemIds,
      count: Number.isInteger(count) ? Math.max(6, Math.min(15, count)) : 10,
      mode
    });

    if (!session.questions.length) {
      return res.status(404).json({ error: "No exercises found for this category" });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = database.toIsoDate(new Date(Date.now() + (1000 * 60 * 60 * 24 * 2)));
    database.createActiveSession({
      userId,
      sessionId,
      language,
      category,
      difficultyLevel: session.recommendedLevel,
      questions: session.questions,
      expiresAt
    });

    return res.json({
      sessionId,
      category,
      language,
      recommendedLevel: session.recommendedLevel,
      difficultyMultiplier: session.difficultyMultiplier,
      questions: session.questions,
      practiceMode: mode || ""
    });
  });

  app.post("/api/session/complete", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const {
      sessionId,
      language,
      category,
      attempts,
      hintsUsed,
      revealedAnswers
    } = req.body || {};

    if (!sessionId || !language || !category || !Array.isArray(attempts) || !attempts.length) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (attempts.length > 400) {
      return res.status(400).json({ error: "Too many attempts in payload" });
    }

    const session = database.getActiveSession(String(sessionId), userId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.completed) return res.status(409).json({ error: "Session already completed" });
    if (session.language !== language || session.category !== category) {
      return res.status(400).json({ error: "Session metadata mismatch" });
    }
    if (session.expiresAt < database.toIsoDate()) {
      return res.status(410).json({ error: "Session expired" });
    }

    const questionMap = new Map<string, SessionQuestion>(
      session.questions.map((question: SessionQuestion) => [question.id, question])
    );
    const isPracticeSession = session.questions.length > 0 &&
      session.questions.every((question: SessionQuestion) => String(question.type || "").startsWith("practice_"));
    let score = 0;
    const questionStats = new Map<string, { hasIncorrect: boolean; awarded: boolean }>();
    const evaluatedAttempts: Array<{
      question: SessionQuestion;
      correct: boolean;
      errorType: ErrorType;
    }> = [];

    for (const attempt of attempts as SessionAttempt[]) {
      const questionId = String(attempt?.questionId || "");
      const question = questionMap.get(questionId);
      if (!question) {
        return res.status(400).json({ error: `Unknown question in attempts: ${questionId}` });
      }

      const evaluation = evaluateAttempt(question, attempt);
      const revealed = Boolean(attempt?.revealed);
      if (!questionStats.has(questionId)) {
        questionStats.set(questionId, { hasIncorrect: false, awarded: false });
      }
      const stats = questionStats.get(questionId);
      if (!stats) {
        return res.status(500).json({ error: "Question scoring state missing" });
      }

      if (evaluation.correct) {
        if (!stats.awarded) {
          if (!revealed) score += 1;
          stats.awarded = true;
        }
      } else {
        stats.hasIncorrect = true;
      }
      evaluatedAttempts.push({
        question,
        correct: evaluation.correct,
        errorType: evaluation.errorType
      });
    }

    const mistakes = Array.from(questionStats.values()).filter((entry) => entry.hasIncorrect).length;

    const baseMaxScore = session.questions.length;
    score = Math.min(score, baseMaxScore);
    const effectiveMaxScore = baseMaxScore;
    const safeHintsUsed = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0;
    const safeRevealedAnswers = Number.isFinite(revealedAnswers)
      ? Math.max(0, Math.floor(revealedAnswers))
      : 0;
    const practiceXp = isPracticeSession ? getPracticeXp(session.questions, score) : 0;
    const xp = isPracticeSession
      ? { xpGained: practiceXp, accuracy: effectiveMaxScore > 0 ? score / effectiveMaxScore : 0 }
      : calculateXp({
        score,
        maxScore: effectiveMaxScore,
        mistakes,
        hintsUsed: safeHintsUsed,
        revealedAnswers: safeRevealedAnswers,
        difficultyLevel: session.difficultyLevel
      });

    const today = database.toIsoDate();
    const saved = isPracticeSession
      ? database.recordPracticeXp({
        userId,
        language,
        xpGained: xp.xpGained,
        today
      })
      : database.recordSession({
        userId,
        language,
        category,
        score,
        maxScore: effectiveMaxScore,
        mistakes,
        xpGained: xp.xpGained,
        difficultyLevel: session.difficultyLevel,
        today
      });

    if (!isPracticeSession) {
      evaluatedAttempts.forEach((entry) => {
        database.upsertItemProgressAttempt({
          userId,
          language,
          category,
          itemId: entry.question.id,
          objective: entry.question.objective || "",
          correct: entry.correct,
          errorType: entry.errorType,
          today
        });
        database.recordAttemptHistory({
          userId,
          sessionId,
          language,
          category,
          itemId: entry.question.id,
          objective: entry.question.objective || "",
          questionType: entry.question.type || "",
          correct: entry.correct,
          errorType: entry.errorType
        });
        database.recordExerciseUsage({
          userId,
          language,
          category,
          itemId: entry.question.id,
          correct: entry.correct
        });
      });
    }

    database.markActiveSessionCompleted(sessionId, userId);
    const progress = isPracticeSession ? database.getProgress(userId, language) : null;
    const categoryProgress = isPracticeSession
      ? progress?.categories?.find((item: any) => item.category === category)
      : null;
    return res.json({
      ok: true,
      evaluated: {
        score,
        maxScore: effectiveMaxScore,
        mistakes,
        accuracy: Number((xp.accuracy * 100).toFixed(1))
      },
      xpGained: saved.xpGained,
      streak: saved.streak,
      learnerLevel: saved.learnerLevel,
      mastery: isPracticeSession ? categoryProgress?.mastery ?? 0 : saved.mastery,
      levelUnlocked: isPracticeSession ? categoryProgress?.levelUnlocked ?? "a1" : saved.levelUnlocked
    });
  });
}

module.exports = {
  registerSessionRoutes
};
