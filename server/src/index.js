const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const database = require("./db");
const {
  LANGUAGES,
  getCourseOverview,
  generateSession,
  LEVEL_XP_MULTIPLIER
} = require("./data");

const port = 4000;

function normalizeSentence(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAnswerMatch(question, submitted) {
  const expectedVariants = [question.answer, ...(question.acceptedAnswers || [])]
    .map((value) => normalizeSentence(value))
    .filter(Boolean);
  const normalizedSubmitted = normalizeSentence(submitted);
  return expectedVariants.includes(normalizedSubmitted);
}

function classifyError(question, submitted) {
  if (question.type === "build_sentence") {
    const expectedTokens = normalizeSentence(question.answer).split(" ").filter(Boolean);
    const actualTokens = normalizeSentence(submitted).split(" ").filter(Boolean);
    if (!actualTokens.length) return "missing_answer";
    const expectedSorted = [...expectedTokens].sort().join(" ");
    const actualSorted = [...actualTokens].sort().join(" ");
    if (expectedSorted === actualSorted && expectedTokens.join(" ") !== actualTokens.join(" ")) {
      return "word_order";
    }
    if (actualTokens.length < expectedTokens.length) return "missing_word";
    return "grammar_or_vocab";
  }
  if (question.type === "dictation_sentence") return "dictation_mismatch";
  if (question.type === "cloze_sentence") return "cloze_choice";
  return "wrong_option";
}

function evaluateAttempt(question, attempt) {
  let submitted = "";
  if (question.type === "build_sentence") submitted = attempt?.builtSentence || "";
  if (question.type === "dictation_sentence") {
    submitted = attempt?.builtSentence || attempt?.textAnswer || "";
  }
  if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
    submitted = attempt?.selectedOption || "";
  }
  if (question.type === "cloze_sentence") {
    submitted = attempt?.selectedOption || "";
    const correct = normalizeSentence(submitted) === normalizeSentence(question.clozeAnswer || "");
    return {
      correct,
      errorType: correct ? "none" : classifyError(question, submitted),
      submitted
    };
  }

  const correct = isAnswerMatch(question, submitted);
  return {
    correct,
    errorType: correct ? "none" : classifyError(question, submitted),
    submitted
  };
}

function calculateXp({
  score,
  maxScore,
  mistakes,
  hintsUsed,
  revealedAnswers,
  difficultyLevel
}) {
  const accuracy = maxScore > 0 ? score / maxScore : 0;
  const baseXp = 16 + maxScore * 2;
  const levelMultiplier = LEVEL_XP_MULTIPLIER[difficultyLevel] || 1;
  const challengeBonus = accuracy >= 0.9 ? 8 : accuracy >= 0.75 ? 4 : 0;
  const penalty = (accuracy < 0.5 ? 6 : 0) + mistakes * 2 + hintsUsed + revealedAnswers * 3;
  const xpGained = Math.max(4, Math.round(baseXp * levelMultiplier + challengeBonus - penalty));
  return { accuracy, xpGained };
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/languages", (_req, res) => {
    res.json(LANGUAGES);
  });

  app.get("/api/course", (req, res) => {
    const language = String(req.query.language || "spanish").toLowerCase();
    const categories = getCourseOverview(language);
    const categoryProgress = database.getCategoryProgress(language);
    const progressMap = new Map(categoryProgress.map((item) => [item.category, item]));

    const enriched = categories.map((category, index) => {
      const progress = progressMap.get(category.id);
      const previousCategory = index > 0 ? categories[index - 1] : null;
      const previousProgress = previousCategory ? progressMap.get(previousCategory.id) : null;
      const unlocked = index === 0
        ? true
        : Boolean(previousProgress && (previousProgress.mastery >= 35 || previousProgress.attempts >= 2));

      return {
        ...category,
        mastery: progress?.mastery ?? 0,
        attempts: progress?.attempts ?? 0,
        accuracy: progress?.accuracy ?? 0,
        levelUnlocked: progress?.levelUnlocked ?? "a1",
        unlocked,
        lockReason: unlocked
          ? ""
          : `Practice ${previousCategory.label} a bit more to unlock this step.`
      };
    });

    res.json(enriched);
  });

  app.post("/api/session/start", (req, res) => {
    const { language, category, count } = req.body || {};
    if (!language || !category) {
      return res.status(400).json({ error: "language and category are required" });
    }

    database.pruneExpiredActiveSessions(database.toIsoDate());
    const mastery = database.getCategoryMastery(language, category);
    const settings = database.getSettings();
    const recentAccuracy = database.getRecentCategoryAccuracy(language, category, 5);
    const hints = database.getItemSelectionHints(language, category, database.toIsoDate());
    const session = generateSession({
      language,
      category,
      mastery,
      recentAccuracy,
      selfRatedLevel: settings.selfRatedLevel,
      dueItemIds: hints.dueItemIds,
      weakItemIds: hints.weakItemIds,
      count: Number.isInteger(count) ? Math.max(6, Math.min(15, count)) : 10
    });

    if (!session.questions.length) {
      return res.status(404).json({ error: "No exercises found for this category" });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = database.toIsoDate(new Date(Date.now() + (1000 * 60 * 60 * 24 * 2)));
    database.createActiveSession({
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
      questions: session.questions
    });
  });

  app.get("/api/settings", (_req, res) => {
    res.json(database.getSettings());
  });

  app.put("/api/settings", (req, res) => {
    const {
      nativeLanguage,
      targetLanguage,
      dailyGoal,
      dailyMinutes,
      weeklyGoalSessions,
      selfRatedLevel,
      learnerName,
      learnerBio,
      focusArea
    } = req.body || {};

    const row = database.saveSettings({
      nativeLanguage: nativeLanguage || "english",
      targetLanguage: targetLanguage || "spanish",
      dailyGoal: Number.isInteger(dailyGoal) ? dailyGoal : 30,
      dailyMinutes: Number.isInteger(dailyMinutes) ? Math.max(5, Math.min(240, dailyMinutes)) : 20,
      weeklyGoalSessions: Number.isInteger(weeklyGoalSessions)
        ? Math.max(1, Math.min(21, weeklyGoalSessions))
        : 5,
      selfRatedLevel: ["a1", "a2", "b1", "b2"].includes(selfRatedLevel) ? selfRatedLevel : "a1",
      learnerName: String(learnerName || "Learner").trim() || "Learner",
      learnerBio: String(learnerBio || "").trim(),
      focusArea: String(focusArea || "").trim()
    });

    res.json(row);
  });

  app.get("/api/progress", (req, res) => {
    const language = String(req.query.language || "").toLowerCase();
    const progress = database.getProgress(language || undefined);

    res.json({
      totalXp: progress.totalXp,
      todayXp: progress.todayXp,
      streak: progress.streak,
      hearts: progress.hearts,
      learnerLevel: progress.learnerLevel,
      lastCompletedDate: progress.lastCompletedDate,
      categories: progress.categories
    });
  });

  app.get("/api/stats", (req, res) => {
    const language = String(req.query.language || "spanish").toLowerCase();
    const stats = database.getStats(language);
    res.json(stats);
  });

  app.post("/api/session/complete", (req, res) => {
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

    const session = database.getActiveSession(String(sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.completed) return res.status(409).json({ error: "Session already completed" });
    if (session.language !== language || session.category !== category) {
      return res.status(400).json({ error: "Session metadata mismatch" });
    }
    if (session.expiresAt < database.toIsoDate()) {
      return res.status(410).json({ error: "Session expired" });
    }

    const questionMap = new Map(session.questions.map((question) => [question.id, question]));
    let score = 0;
    let mistakes = 0;
    const evaluatedAttempts = [];

    for (const attempt of attempts) {
      const questionId = String(attempt?.questionId || "");
      const question = questionMap.get(questionId);
      if (!question) {
        return res.status(400).json({ error: `Unknown question in attempts: ${questionId}` });
      }

      const evaluation = evaluateAttempt(question, attempt);
      if (evaluation.correct) score += 1;
      else mistakes += 1;
      evaluatedAttempts.push({
        question,
        correct: evaluation.correct,
        errorType: evaluation.errorType
      });
    }

    const baseMaxScore = session.questions.length;
    const effectiveMaxScore = Math.max(baseMaxScore, score + mistakes);
    const safeHintsUsed = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0;
    const safeRevealedAnswers = Number.isFinite(revealedAnswers)
      ? Math.max(0, Math.floor(revealedAnswers))
      : 0;
    const xp = calculateXp({
      score,
      maxScore: effectiveMaxScore,
      mistakes,
      hintsUsed: safeHintsUsed,
      revealedAnswers: safeRevealedAnswers,
      difficultyLevel: session.difficultyLevel
    });

    const today = database.toIsoDate();
    const saved = database.recordSession({
      language,
      category,
      score,
      maxScore: effectiveMaxScore,
      mistakes,
      xpGained: xp.xpGained,
      difficultyLevel: session.difficultyLevel,
      today
    });

    evaluatedAttempts.forEach((entry) => {
      database.upsertItemProgressAttempt({
        language,
        category,
        itemId: entry.question.id,
        objective: entry.question.objective || "",
        correct: entry.correct,
        errorType: entry.errorType,
        today
      });
      database.recordAttemptHistory({
        sessionId,
        language,
        category,
        itemId: entry.question.id,
        objective: entry.question.objective || "",
        questionType: entry.question.type || "",
        correct: entry.correct,
        errorType: entry.errorType
      });
    });

    database.markActiveSessionCompleted(sessionId);
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
      hearts: saved.hearts,
      learnerLevel: saved.learnerLevel,
      mastery: saved.mastery,
      levelUnlocked: saved.levelUnlocked
    });
  });

  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(clientDistPath, "index.html"));
    });
  }

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(port, () => {
    console.log(`LingoFlow API listening on http://localhost:${port}`);
  });
}

module.exports = {
  createApp,
  normalizeSentence,
  evaluateAttempt,
  calculateXp
};
