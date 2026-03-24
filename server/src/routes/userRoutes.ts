function registerUserRoutes(app: any, deps: any): void {
  const { requireAuth, database } = deps;
  const contributionReviewerEmails = new Set(
    String(process.env.CONTRIBUTION_REVIEWER_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

  function canModerateCommunityExercises(userId: number) {
    const user = database.getUserById(userId);
    if (!user) return false;
    if (user.id === 1) return true;
    return contributionReviewerEmails.has(String(user.email || "").trim().toLowerCase());
  }

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

  app.get("/api/community/contributions", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const canModerate = canModerateCommunityExercises(userId);
    const scope = String(req.query.scope || "").trim().toLowerCase();
    const includeAll = canModerate && scope === "all";
    const moderationStatus = String(req.query.status || "").trim().toLowerCase();
    const language = String(req.query.language || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();
    const limit = Number.parseInt(String(req.query.limit || "50"), 10);

    const submissions = database.listCommunityExercises({
      userId,
      includeAll,
      language,
      category,
      moderationStatus,
      limit
    });

    return res.json({
      ok: true,
      canModerate,
      scope: includeAll ? "all" : "mine",
      submissions
    });
  });

  app.patch("/api/community/contributions/:id", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    if (!canModerateCommunityExercises(userId)) {
      return res.status(403).json({ error: "Reviewer access required" });
    }

    const id = Number.parseInt(String(req.params.id || ""), 10);
    const moderationStatus = String(req.body?.moderationStatus || "").trim().toLowerCase();
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "A valid contribution id is required" });
    }
    if (!["pending", "approved", "rejected"].includes(moderationStatus)) {
      return res.status(400).json({ error: "moderationStatus must be pending, approved, or rejected" });
    }

    const submission = database.updateCommunityExerciseModerationStatus({ id, moderationStatus });
    if (!submission) {
      return res.status(404).json({ error: "Contribution not found" });
    }

    return res.json({
      ok: true,
      message: `Contribution marked ${moderationStatus}.`,
      submission
    });
  });
}

module.exports = {
  registerUserRoutes
};
