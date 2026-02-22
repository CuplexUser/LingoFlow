const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const database = require("./db");
const {
  LANGUAGES,
  getCourseOverview,
  generateSession,
  LEVEL_XP_MULTIPLIER
} = require("./data");

const app = express();
const port = 4000;

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

  const mastery = database.getCategoryMastery(language, category);
  const settings = database.getSettings();
  const recentAccuracy = database.getRecentCategoryAccuracy(language, category, 5);
  const session = generateSession({
    language,
    category,
    mastery,
    recentAccuracy,
    selfRatedLevel: settings.selfRatedLevel,
    count: Number.isInteger(count) ? Math.max(6, Math.min(15, count)) : 10
  });

  if (!session.questions.length) {
    return res.status(404).json({ error: "No exercises found for this category" });
  }

  return res.json({
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
    language,
    category,
    score,
    maxScore,
    mistakes,
    hintsUsed,
    revealedAnswers,
    difficultyLevel
  } = req.body || {};

  if (!language || !category || !Number.isFinite(score) || !Number.isFinite(maxScore)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const normalizedLevel = ["a1", "a2", "b1", "b2"].includes(difficultyLevel)
    ? difficultyLevel
    : "a1";
  const safeMistakes = Number.isFinite(mistakes) ? Math.max(0, Math.floor(mistakes)) : 0;
  const safeHintsUsed = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0;
  const safeRevealedAnswers = Number.isFinite(revealedAnswers)
    ? Math.max(0, Math.floor(revealedAnswers))
    : 0;

  const effectiveMaxScore = maxScore + safeMistakes;
  const accuracy = effectiveMaxScore > 0 ? score / effectiveMaxScore : 0;
  const baseXp = 16 + maxScore * 2;
  const levelMultiplier = LEVEL_XP_MULTIPLIER[normalizedLevel] || 1;
  const challengeBonus = accuracy >= 0.9 ? 8 : accuracy >= 0.75 ? 4 : 0;
  const penalty = (accuracy < 0.5 ? 6 : 0) + safeMistakes * 2 + safeHintsUsed + safeRevealedAnswers * 3;
  const xpGained = Math.max(4, Math.round(baseXp * levelMultiplier + challengeBonus - penalty));

  const today = database.toIsoDate();
  const saved = database.recordSession({
    language,
    category,
    score,
    maxScore: effectiveMaxScore,
    mistakes: safeMistakes,
    xpGained,
    difficultyLevel: normalizedLevel,
    today
  });

  return res.json({
    ok: true,
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

app.listen(port, () => {
  console.log(`LingoFlow API listening on http://localhost:${port}`);
});
