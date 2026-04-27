function registerCourseRoutes(app: any, deps: any): void {
  const { requireAuth, database, LANGUAGES, CATEGORIES, LEVEL_ORDER, COURSE, getCourseOverview, getContentMetrics } = deps;

  const contentReviewerEmails = new Set(
    String(process.env.CONTRIBUTION_REVIEWER_EMAILS || "")
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  function canAccessAdminRoutes(userId: number): boolean {
    const user = database.getUserById(userId);
    if (!user) return false;
    if (user.id === 1) return true;
    return contentReviewerEmails.has(String(user.email || "").trim().toLowerCase());
  }
  app.set("trust proxy", true);

  function normalizeIpAddress(value: unknown): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw === "::1") return "127.0.0.1";
    if (raw.startsWith("::ffff:")) return raw.slice(7);
    return raw;
  }

  function getRequestIpAddress(req: any): string {
    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    const candidates = [
      forwarded,
      req.headers["x-real-ip"],
      req.ip,
      req.socket?.remoteAddress,
      req.connection?.remoteAddress
    ];

    for (const candidate of candidates) {
      const normalized = normalizeIpAddress(candidate);
      if (normalized) return normalized;
    }
    return "";
  }

  app.get("/api/health", (_req: any, res: any) => {
    res.json({ ok: true });
  });

  app.get("/api/languages", (_req: any, res: any) => {
    res.json(LANGUAGES);
  });

  app.post("/api/visitors/login", (req: any, res: any) => {
    const ipAddress = getRequestIpAddress(req);
    database.recordLoginPageVisit({ ipAddress });
    return res.status(202).json({ ok: true });
  });

  app.get("/api/course", requireAuth, (req: any, res: any) => {
    const userId = req.authUserId;
    const settings = database.getSettings(userId);
    const devUnlockAll = process.env.NODE_ENV !== "production" && Boolean(settings.unlockAllLessons);
    const language = String(req.query.language || settings.targetLanguage || "spanish").toLowerCase();
    const categories = getCourseOverview(language) as any[];
    const categoryProgress = database.getCategoryProgress(userId, language) as any[];
    const progressMap = new Map<string, any>(categoryProgress.map((item: any) => [item.category, item]));
    const recommendedCategoryIds = new Set(database.getCategoryRecommendations(userId, language));

    const enriched = categories.map((category: any, index: number) => {
      const progress = progressMap.get(category.id);
      const previousCategory = index > 0 ? categories[index - 1] : null;
      const previousProgress = previousCategory ? progressMap.get(previousCategory.id) : null;
      const unlocked = devUnlockAll
        ? true
        : index === 0
        ? true
        : Boolean(previousProgress && (previousProgress.mastery >= 35 || previousProgress.attempts >= 2));

      return {
        ...category,
        mastery: progress?.mastery ?? 0,
        attempts: progress?.attempts ?? 0,
        accuracy: progress?.accuracy ?? 0,
        levelUnlocked: progress?.levelUnlocked ?? "a1",
        recommended: recommendedCategoryIds.has(category.id),
        unlocked,
        lockReason: unlocked
          ? ""
          : `Practice ${previousCategory.label} a bit more to unlock this step.`
      };
    });

    res.json(enriched);
  });

  app.get("/api/content/metrics", requireAuth, (req: any, res: any) => {
    const language = String(req.query.language || "").trim().toLowerCase();
    res.json(getContentMetrics({ language }));
  });

  app.get("/api/admin/content-stats", requireAuth, (req: any, res: any) => {
    if (!canAccessAdminRoutes(req.authUserId)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const coverage: Record<string, Record<string, any>> = {};
    for (const lang of LANGUAGES) {
      coverage[lang.id] = {};
      for (const cat of CATEGORIES) {
        const items: any[] = COURSE[lang.id]?.[cat.id] || [];
        const levelCounts: Record<string, number> = {};
        const typeCounts: Record<string, number> = {};
        for (const item of items) {
          const lvl = String(item.level || "").toLowerCase();
          levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
          const t = String(item.exerciseType || "auto").toLowerCase();
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
        coverage[lang.id][cat.id] = {
          a1: levelCounts["a1"] || 0,
          a2: levelCounts["a2"] || 0,
          b1: levelCounts["b1"] || 0,
          b2: levelCounts["b2"] || 0,
          total: items.length,
          types: typeCounts
        };
      }
    }

    res.json({
      languages: LANGUAGES.map((l: any) => ({ id: l.id, label: l.label, flag: l.flag })),
      categories: CATEGORIES.map((c: any) => ({ id: c.id, label: c.label })),
      levels: LEVEL_ORDER,
      coverage
    });
  });
}

module.exports = {
  registerCourseRoutes
};
