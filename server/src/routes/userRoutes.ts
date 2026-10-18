const crypto = require("crypto");

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

// RevenueCat timestamps omit milliseconds ("...:42Z"); stored values must use one ISO
// format so text comparison against toISOString() cutoffs stays correct.
function normalizeIsoTimestamp(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// RevenueCat app user ids are our numeric user ids (the app calls Purchases.logIn with
// it). Anonymous ids ("$RCAnonymousID:...") never map to an account and are skipped.
function toUserId(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function registerUserRoutes(app: any, deps: any): void {
  const { requireAuth, database, injectCommunityItem, premiumEntitlement } = deps;
  const revenueCatSecretKey = String(process.env.REVENUECAT_SECRET_API_KEY || "").trim();
  const revenueCatWebhookAuth = String(process.env.REVENUECAT_WEBHOOK_AUTH || "").trim();

  // RevenueCat's subscriber record is the source of truth. Webhook payloads only tell
  // us *that* something changed; re-reading the record avoids having to reconcile
  // out-of-order or redelivered events into a state machine of our own.
  async function syncSubscriber(userId: number) {
    if (!revenueCatSecretKey) {
      throw new Error("RevenueCat is not configured");
    }
    const response = await fetch(
      `${REVENUECAT_API_BASE}/subscribers/${encodeURIComponent(String(userId))}`,
      { headers: { Authorization: `Bearer ${revenueCatSecretKey}`, Accept: "application/json" } }
    );
    if (!response.ok) {
      throw new Error(`RevenueCat API error ${response.status}`);
    }
    const payload = await response.json() as any;
    const subscriber = payload?.subscriber || {};
    const entitlement = subscriber.entitlements?.[premiumEntitlement];
    if (!entitlement) {
      await database.deleteSubscription(userId, premiumEntitlement);
      return null;
    }

    // Play product ids may carry the base plan ("product:base-plan"); the subscriptions
    // map is keyed by either form depending on the SDK that made the purchase.
    const productId = String(entitlement.product_identifier || "");
    const subscriptions = subscriber.subscriptions || {};
    const storeSubscription = subscriptions[productId] || subscriptions[productId.split(":")[0]] || null;
    await database.upsertSubscription({
      userId,
      entitlement: premiumEntitlement,
      provider: "revenuecat",
      productId,
      store: String(storeSubscription?.store || ""),
      // A grace period (failed renewal Play is still retrying) keeps access open.
      expiresAt: normalizeIsoTimestamp(entitlement.grace_period_expires_date) ||
        normalizeIsoTimestamp(entitlement.expires_date),
      willRenew: Boolean(storeSubscription) && !storeSubscription.unsubscribe_detected_at,
      billingIssue: Boolean(storeSubscription?.billing_issues_detected_at)
    });
    return database.getActiveSubscription(userId, premiumEntitlement);
  }

  app.post("/api/billing/revenuecat-webhook", async (req: any, res: any) => {
    if (!revenueCatWebhookAuth) {
      return res.status(503).json({ error: "Billing webhook is not configured" });
    }
    if (!safeEqual(String(req.headers.authorization || ""), revenueCatWebhookAuth)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const event = req.body?.event || {};
    const eventId = String(event.id || "").trim();
    const eventType = String(event.type || "").trim();
    if (!eventId) {
      return res.status(400).json({ error: "event.id is required" });
    }
    if (eventType === "TEST") {
      return res.json({ ok: true });
    }

    // TRANSFER moves a purchase between app users, so both sides need a re-sync.
    const candidateIds = [
      event.app_user_id,
      event.original_app_user_id,
      ...(Array.isArray(event.aliases) ? event.aliases : []),
      ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
      ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])
    ];
    const userIds: number[] = [];
    for (const candidate of candidateIds) {
      const userId = toUserId(candidate);
      if (userId && !userIds.includes(userId) && await database.getUserById(userId)) {
        userIds.push(userId);
      }
    }

    const isNewEvent = await database.recordBillingEvent({
      eventId,
      userId: userIds[0] ?? null,
      eventType
    });
    if (!isNewEvent) {
      return res.json({ ok: true, duplicate: true });
    }

    try {
      for (const userId of userIds) {
        await syncSubscriber(userId);
      }
    } catch (error) {
      // Un-record the event so RevenueCat's retry is processed instead of skipped.
      await database.forgetBillingEvent(eventId);
      console.error("[billing] RevenueCat webhook sync failed", {
        eventId,
        eventType,
        reason: error instanceof Error ? error.message : "unknown"
      });
      return res.status(500).json({ error: "Could not sync subscription" });
    }

    return res.json({ ok: true, synced: userIds.length });
  });

  // Called by the app right after a purchase or restore, so access does not wait on
  // webhook delivery.
  app.post("/api/billing/sync", requireAuth, async (req: any, res: any) => {
    try {
      const subscription = await syncSubscriber(req.authUserId);
      return res.json({ isPremium: Boolean(subscription), subscription });
    } catch (error) {
      console.error("[billing] RevenueCat sync failed", {
        userId: req.authUserId,
        reason: error instanceof Error ? error.message : "unknown"
      });
      return res.status(502).json({ error: "Could not reach the billing service" });
    }
  });
  const contributionReviewerEmails = new Set(
    String(process.env.CONTRIBUTION_REVIEWER_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

  async function canModerateCommunityExercises(userId: number) {
    const user = await database.getUserById(userId);
    if (!user) return false;
    if (user.id === 1) return true;
    return contributionReviewerEmails.has(String(user.email || "").trim().toLowerCase());
  }

  app.get("/api/settings", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    res.json(await database.getSettings(userId));
  });

  app.put("/api/settings", requireAuth, async (req: any, res: any) => {
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
      unlockAllLessons,
      speechRate
    } = req.body || {};

    const devUnlockAll = process.env.NODE_ENV !== "production" && Boolean(unlockAllLessons);
    const row = await database.saveSettings(userId, {
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
      unlockAllLessons: devUnlockAll,
      speechRate
    });

    res.json(row);
  });

  app.get("/api/user/achievements", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    res.json(await database.getUserAchievements(userId));
  });

  app.get("/api/progress", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "").toLowerCase();
    const progress = await database.getProgress(userId, language || undefined);

    res.json({
      totalXp: progress.totalXp,
      todayXp: progress.todayXp,
      streak: progress.streak,
      learnerLevel: progress.learnerLevel,
      lastCompletedDate: progress.lastCompletedDate,
      categories: progress.categories
    });
  });

  app.get("/api/progress-overview", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const overview = await database.getProgressOverview(userId);
    res.json(overview);
  });

  app.get("/api/stats", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const settings = await database.getSettings(userId);
    const language = String(req.query.language || settings.targetLanguage || "spanish").toLowerCase();
    const stats = await database.getStats(userId, language);
    res.json(stats);
  });

  app.get("/api/visitors/stats", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    if (!await canModerateCommunityExercises(userId)) {
      return res.status(403).json({ error: "Reviewer access required" });
    }
    const sinceDays = Number.parseInt(String(req.query.sinceDays || "30"), 10);
    const stats = await database.getVisitorStats({ sinceDays });
    res.json(stats);
  });

  app.post("/api/community/contribute", requireAuth, async (req: any, res: any) => {
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

    const saved = await database.createCommunityExercise({
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

  app.get("/api/community/contributions", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const canModerate = await canModerateCommunityExercises(userId);
    const scope = String(req.query.scope || "").trim().toLowerCase();
    const includeAll = canModerate && scope === "all";
    const moderationStatus = String(req.query.status || "").trim().toLowerCase();
    const language = String(req.query.language || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();
    const limit = Number.parseInt(String(req.query.limit || "50"), 10);

    const submissions = await database.listCommunityExercises({
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

  app.patch("/api/community/contributions/:id", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    if (!await canModerateCommunityExercises(userId)) {
      return res.status(403).json({ error: "Reviewer access required" });
    }

    const id = Number.parseInt(String(req.params.id || ""), 10);
    const moderationStatus = String(req.body?.moderationStatus || "").trim().toLowerCase();
    const reviewerComment = String(req.body?.reviewerComment || "").trim().slice(0, 1000);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "A valid contribution id is required" });
    }
    if (!["pending", "approved", "rejected", "changes_requested"].includes(moderationStatus)) {
      return res.status(400).json({ error: "moderationStatus must be pending, approved, rejected, or changes_requested" });
    }

    const submission = await database.updateCommunityExerciseModerationStatus({
      id,
      moderationStatus,
      reviewerComment,
      reviewedBy: userId
    });
    if (!submission) {
      return res.status(404).json({ error: "Contribution not found" });
    }

    if (moderationStatus === "approved" && injectCommunityItem) {
      injectCommunityItem({
        id: submission.id,
        language: submission.language,
        category: submission.category,
        difficulty: submission.difficulty,
        prompt: submission.prompt,
        correctAnswer: submission.correctAnswer,
        hints: submission.hints,
        exerciseType: submission.exerciseType
      });
    }

    return res.json({
      ok: true,
      message: `Contribution marked ${moderationStatus}.`,
      submission
    });
  });

  app.get("/api/community/contributions/pending-count", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    if (!await canModerateCommunityExercises(userId)) {
      return res.json({ count: 0 });
    }
    return res.json({ count: await database.getPendingCommunityExerciseCount() });
  });

  app.get("/api/bookmarks", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "").trim() || undefined;
    return res.json(await database.getBookmarks(userId, language));
  });

  app.post("/api/bookmarks", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const questionId = String(req.body?.questionId || "").trim();
    const prompt = String(req.body?.prompt || "").trim();
    const answer = String(req.body?.answer || "").trim();
    const language = String(req.body?.language || "").trim();
    const category = String(req.body?.category || "").trim();
    if (!questionId || !prompt || !answer || !language) {
      return res.status(400).json({ error: "questionId, prompt, answer, and language are required" });
    }
    await database.addBookmark(userId, { questionId, prompt, answer, language, category });
    return res.json({ ok: true, bookmarked: true });
  });

  app.delete("/api/bookmarks/:questionId", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const questionId = String(req.params.questionId || "").trim();
    if (!questionId) return res.status(400).json({ error: "questionId is required" });
    await database.removeBookmark(userId, questionId);
    return res.json({ ok: true, bookmarked: false });
  });

  app.get("/api/saved-words", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "").trim() || undefined;
    return res.json(await database.getSavedReviewWords(userId, language));
  });

  app.post("/api/saved-words", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const language = String(req.body?.language || "").trim();
    const word = String(req.body?.word || "").trim();
    const translation = String(req.body?.translation || "").trim();
    const storyId = String(req.body?.storyId || "").trim();
    const category = String(req.body?.category || "").trim();
    if (!language || !word) {
      return res.status(400).json({ error: "language and word are required" });
    }
    await database.saveReviewWord(userId, { language, word, translation, storyId, category });
    return res.json({ ok: true, saved: true });
  });

  app.delete("/api/saved-words/:word", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const word = String(req.params.word || "").trim();
    const language = String(req.query.language || req.body?.language || "").trim();
    if (!word || !language) {
      return res.status(400).json({ error: "language and word are required" });
    }
    await database.removeReviewWord(userId, language, word);
    return res.json({ ok: true, saved: false });
  });
}

module.exports = {
  registerUserRoutes
};
