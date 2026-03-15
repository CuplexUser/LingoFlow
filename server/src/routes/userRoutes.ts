function registerUserRoutes(app: any, deps: any): void {
  const { requireAuth, database } = deps;

  app.get("/api/settings", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    res.json(database.getSettings(userId));
  });

  app.put("/api/settings", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const {
      nativeLanguage,
      targetLanguage,
      dailyGoal,
      dailyMinutes,
      weeklyGoalSessions,
      selfRatedLevel,
      learnerName,
      learnerBio,
      focusArea,
      unlockAllLessons
    } = req.body || {};

    const devUnlockAll = process.env.NODE_ENV !== "production" && Boolean(unlockAllLessons);
    const row = database.saveSettings(userId, {
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
      focusArea: String(focusArea || "").trim(),
      unlockAllLessons: devUnlockAll
    });

    res.json(row);
  });

  app.get("/api/progress", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "").toLowerCase();
    const progress = database.getProgress(userId, language || undefined);

    res.json({
      totalXp: progress.totalXp,
      todayXp: progress.todayXp,
      streak: progress.streak,
      learnerLevel: progress.learnerLevel,
      lastCompletedDate: progress.lastCompletedDate,
      categories: progress.categories
    });
  });

  app.get("/api/progress-overview", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const overview = database.getProgressOverview(userId);
    res.json(overview);
  });

  app.get("/api/stats", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const settings = database.getSettings(userId);
    const language = String(req.query.language || settings.targetLanguage || "spanish").toLowerCase();
    const stats = database.getStats(userId, language);
    res.json(stats);
  });

  app.post("/api/community/contribute", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const {
      language,
      category,
      prompt,
      correctAnswer,
      hints,
      difficulty,
      audioUrl,
      imageUrl,
      culturalNote,
      exerciseType
    } = req.body || {};

    if (!language || !category || !prompt || !correctAnswer) {
      return res.status(400).json({ error: "language, category, prompt, and correctAnswer are required" });
    }
    if (!["a1", "a2", "b1", "b2"].includes(String(difficulty || "a1").toLowerCase())) {
      return res.status(400).json({ error: "difficulty must be one of a1, a2, b1, b2" });
    }

    const saved = database.createCommunityExercise({
      userId,
      language,
      category,
      prompt,
      correctAnswer,
      hints: Array.isArray(hints) ? hints.slice(0, 5).map((item) => String(item || "").trim()).filter(Boolean) : [],
      difficulty,
      audioUrl,
      imageUrl,
      culturalNote,
      exerciseType
    });

    return res.status(201).json({
      ok: true,
      message: "Thanks. Your exercise has been submitted for moderation.",
      submission: {
        id: saved.id,
        language: saved.language,
        category: saved.category,
        prompt: saved.prompt,
        difficulty: saved.difficulty,
        moderationStatus: saved.moderation_status
      }
    });
  });
}

module.exports = {
  registerUserRoutes
};
