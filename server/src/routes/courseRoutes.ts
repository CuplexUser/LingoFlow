const { LIBRE_LANG_CODES, createLibreTranslate } = require("../libreTranslate.ts");
const logger = require("../logger.ts");

function registerCourseRoutes(app: any, deps: any): void {
  const { requireAuth, database, LANGUAGES, CATEGORIES, LEVEL_ORDER, COURSE, getCourseOverview, getContentMetrics, rebuildContentWordTranslations, rebuildAllWordTranslations, collectCourseWords, isCourseScriptWord, listStories, getStoryById, sanitizeStoryForClient, computeStoryXp, recommendNextStory, getLevelCap } = deps;

  const PREMIUM_REQUIRED = {
    error: "This content requires LingoFlow Premium",
    code: "premium_required"
  };

  // True when content at `level` sits above the request's free-tier cap ("" = no cap).
  function isAboveLevelCap(level: unknown, levelCap: string): boolean {
    if (!levelCap) return false;
    const rank = LEVEL_ORDER.indexOf(String(level || "a1").toLowerCase());
    return rank > LEVEL_ORDER.indexOf(levelCap);
  }

  const contentReviewerEmails = new Set(
    String(process.env.CONTRIBUTION_REVIEWER_EMAILS || "")
      .split(",")
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  async function canAccessAdminRoutes(userId: number): Promise<boolean> {
    const user = await database.getUserById(userId);
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

  app.post("/api/visitors/login", async (req: any, res: any) => {
    const ipAddress = getRequestIpAddress(req);
    await database.recordLoginPageVisit({ ipAddress });
    return res.status(202).json({ ok: true });
  });

  app.get("/api/course", requireAuth, async (req: any, res: any) => {
    const userId = req.authUserId;
    const settings = await database.getSettings(userId);
    const devUnlockAll = process.env.NODE_ENV !== "production" && Boolean(settings.unlockAllLessons);
    const language = String(req.query.language || settings.targetLanguage || "spanish").toLowerCase();
    const categories = getCourseOverview(language) as any[];
    const categoryProgress = await database.getCategoryProgress(userId, language) as any[];
    const progressMap = new Map<string, any>(categoryProgress.map((item: any) => [item.category, item]));
    const recommendedCategoryIds = new Set(await database.getCategoryRecommendations(userId, language));
    const levelCap = await getLevelCap(req);

    const enriched = categories.map((category: any, index: number) => {
      const progress = progressMap.get(category.id);
      const previousCategory = index > 0 ? categories[index - 1] : null;
      const previousProgress = previousCategory ? progressMap.get(previousCategory.id) : null;
      const progressionUnlocked = devUnlockAll
        ? true
        : index === 0
        ? true
        : Boolean(previousProgress && (previousProgress.mastery >= 35 || previousProgress.attempts >= 2));
      const levels: string[] = Array.isArray(category.levels) ? category.levels : [];
      const premiumLevels = levels.filter((level) => isAboveLevelCap(level, levelCap));
      // A category with no content at or below the cap has nothing to offer a free user.
      const premiumOnly = levels.length > 0 && premiumLevels.length === levels.length;
      const unlocked = progressionUnlocked && !premiumOnly;

      return {
        ...category,
        mastery: progress?.mastery ?? 0,
        attempts: progress?.attempts ?? 0,
        accuracy: progress?.accuracy ?? 0,
        levelUnlocked: progress?.levelUnlocked ?? "a1",
        recommended: recommendedCategoryIds.has(category.id),
        levelCap: levelCap || null,
        premiumLevels,
        unlocked,
        lockReason: unlocked
          ? ""
          : premiumOnly
          ? "premium"
          : `Practice ${previousCategory.label} a bit more to unlock this step.`
      };
    });

    res.json(enriched);
  });

  app.get("/api/stories", requireAuth, async (req: any, res: any) => {
    const language = String(req.query.language || "").trim().toLowerCase();
    const level = String(req.query.level || "").trim().toLowerCase();
    const category = String(req.query.category || "").trim();
    const summaries = listStories({ language, level, category });
    const progress = await database.getStoryProgress(req.authUserId, language || undefined);
    const levelCap = await getLevelCap(req);
    return res.json(
      summaries.map((story: any) => {
        const state = progress[story.id];
        return {
          ...story,
          premiumLocked: isAboveLevelCap(story.level, levelCap),
          completed: Boolean(state && state.completedAt),
          lastSentenceIndex: state ? state.lastSentenceIndex : 0,
          quizScore: state ? state.quizScore : null,
          quizTotal: state ? state.quizTotal : null
        };
      })
    );
  });

  // "/stats" and "/recommended" must be registered before "/:id" so Express does
  // not capture those words as a story id.
  app.get("/api/stories/stats", requireAuth, async (req: any, res: any) => {
    const language = String(req.query.language || "").trim().toLowerCase();
    const stats = await database.getReadingStats(req.authUserId, language || undefined);
    let sentencesRead = 0;
    const levels = new Set<string>();
    const themes = new Set<string>();
    for (const id of stats.completedStoryIds) {
      const story = getStoryById(id);
      if (!story) continue;
      sentencesRead += story.sentences.length;
      if (story.level) levels.add(story.level);
      if (story.theme) themes.add(story.theme);
    }
    return res.json({
      storiesRead: stats.storiesRead,
      sentencesRead,
      wordsSaved: stats.wordsSaved,
      quizzesTaken: stats.quizzesTaken,
      levels: [...levels],
      themes: [...themes]
    });
  });

  app.get("/api/stories/recommended", requireAuth, async (req: any, res: any) => {
    const language = String(req.query.language || "").trim().toLowerCase();
    if (!language) return res.json(null);
    const completedIds = await database.getCompletedStoryIds(req.authUserId, language);
    const settings = await database.getSettings(req.authUserId);
    const categoryProgress = await database.getCategoryProgress(req.authUserId, language) || [];
    const topCategory = [...categoryProgress].sort(
      (a: any, b: any) => (b.attempts || 0) - (a.attempts || 0)
    )[0];
    const levelCap = await getLevelCap(req);
    const recommended = recommendNextStory({
      language,
      completedIds,
      level: isAboveLevelCap(settings.selfRatedLevel, levelCap) ? levelCap : settings.selfRatedLevel,
      category: topCategory ? topCategory.category : ""
    });
    if (recommended && isAboveLevelCap(recommended.level, levelCap)) return res.json(null);
    return res.json(recommended);
  });

  app.get("/api/stories/:id", requireAuth, async (req: any, res: any) => {
    const story = getStoryById(String(req.params.id || ""));
    if (!story) return res.status(404).json({ error: "Story not found" });
    if (isAboveLevelCap(story.level, await getLevelCap(req))) {
      return res.status(402).json(PREMIUM_REQUIRED);
    }
    return res.json(sanitizeStoryForClient(story));
  });

  app.post("/api/stories/:id/progress", requireAuth, async (req: any, res: any) => {
    const story = getStoryById(String(req.params.id || ""));
    if (!story) return res.status(404).json({ error: "Story not found" });
    await database.upsertStoryProgress(req.authUserId, {
      storyId: story.id,
      language: story.language,
      sentenceIndex: Number(req.body?.sentenceIndex)
    });
    return res.json({ ok: true });
  });

  app.post("/api/stories/:id/complete", requireAuth, async (req: any, res: any) => {
    const story = getStoryById(String(req.params.id || ""));
    if (!story) return res.status(404).json({ error: "Story not found" });

    const questions = Array.isArray(story.questions) ? story.questions : [];
    const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];

    let quizScore: number | null = null;
    let quizTotal: number | null = null;
    let perQuestion: boolean[] = [];
    let correctAnswers: number[] = [];
    let explanations: (string | null)[] = [];

    if (questions.length > 0) {
      quizTotal = questions.length;
      let score = 0;
      perQuestion = questions.map((question: any, index: number) => {
        const isCorrect = Number(rawAnswers[index]) === question.correct;
        if (isCorrect) score += 1;
        return isCorrect;
      });
      quizScore = score;
      correctAnswers = questions.map((question: any) => question.correct);
      explanations = questions.map((question: any) => question.explanation || null);
    }

    await database.markStoryComplete(req.authUserId, {
      storyId: story.id,
      language: story.language,
      quizScore,
      quizTotal
    });
    const potentialXp = computeStoryXp(
      story.level,
      quizScore == null ? undefined : quizScore,
      quizTotal == null ? undefined : quizTotal
    );
    const award = await database.awardStoryXp(req.authUserId, {
      storyId: story.id,
      language: story.language,
      xpGained: potentialXp
    });
    const unlockedAchievements = await database.grantAchievement(req.authUserId, "story_1");

    return res.json({
      ok: true,
      quizScore,
      quizTotal,
      perQuestion,
      correctAnswers,
      explanations,
      xpGained: award.xpGained,
      alreadyAwarded: award.alreadyAwarded,
      todayXp: award.todayXp,
      unlockedAchievements
    });
  });

  app.get("/api/content/metrics", requireAuth, async (req: any, res: any) => {
    const language = String(req.query.language || "").trim().toLowerCase();
    res.json(getContentMetrics({ language }));
  });

  // Learners can flag an exercise from the wrong-answer panel; admins see the reports, with
  // the item they point at, on the content page.
  const REPORT_REASONS = new Set(["several-answers", "wrong-answer", "other"]);

  function findCourseItem(language: string, itemId: string): { category: string; item: any } | null {
    for (const [category, items] of Object.entries(COURSE[language] || {})) {
      const item = (items as any[]).find((entry) => String(entry?.id) === itemId);
      if (item) return { category, item };
    }
    return null;
  }

  app.post("/api/content/report", requireAuth, async (req: any, res: any) => {
    const language = String(req.body?.language || "").trim().toLowerCase();
    const itemId = String(req.body?.itemId || "").trim();
    const reason = String(req.body?.reason || "").trim();
    if (!REPORT_REASONS.has(reason)) {
      return res.status(400).json({ error: `reason must be one of ${[...REPORT_REASONS].join(", ")}` });
    }
    if (!findCourseItem(language, itemId)) {
      return res.status(404).json({ error: "No such exercise" });
    }
    await database.reportContent({ userId: req.authUserId, language, itemId, reason });
    return res.status(201).json({ ok: true });
  });

  app.get("/api/admin/content-reports", requireAuth, async (req: any, res: any) => {
    if (!await canAccessAdminRoutes(req.authUserId)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    const reports = (await database.listContentReports()).map((report: any) => {
      const found = findCourseItem(report.language, report.itemId);
      return {
        ...report,
        category: found?.category || "",
        prompt: String(found?.item.prompt || ""),
        correctAnswer: String(found?.item.correctAnswer || found?.item.target || "")
      };
    });
    return res.json({ reports });
  });

  app.get("/api/admin/content-stats", requireAuth, async (req: any, res: any) => {
    if (!await canAccessAdminRoutes(req.authUserId)) {
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

    const allStories = listStories();
    const stories: Record<string, any> = {};
    for (const lang of LANGUAGES) {
      const langStories = allStories.filter((s: any) => s.language === lang.id);
      const levelCounts: Record<string, number> = {};
      let sentences = 0;
      for (const story of langStories) {
        const lvl = String(story.level || "").toLowerCase();
        levelCounts[lvl] = (levelCounts[lvl] || 0) + 1;
        sentences += Number(story.sentenceCount || 0);
      }
      stories[lang.id] = {
        a1: levelCounts["a1"] || 0,
        a2: levelCounts["a2"] || 0,
        b1: levelCounts["b1"] || 0,
        b2: levelCounts["b2"] || 0,
        total: langStories.length,
        sentences
      };
    }

    res.json({
      languages: LANGUAGES.map((l: any) => ({ id: l.id, label: l.label, flag: l.flag })),
      categories: CATEGORIES.map((c: any) => ({ id: c.id, label: c.label })),
      levels: LEVEL_ORDER,
      coverage,
      stories
    });
  });

  // Pre-translation chunk size and wait. A chunk takes LibreTranslate a few seconds; the
  // wait leaves room for a cold start inside Cloud Run's 60-second request limit.
  const PREFETCH_CHUNK = 100;
  const PREFETCH_TIMEOUT_MS = 45_000;

  const libreTranslate = createLibreTranslate({
    url: process.env.LIBRETRANSLATE_URL,
    apiKey: process.env.LIBRETRANSLATE_API_KEY,
    logger
  });

  // Words being looked up in the background, as "language\u0000word", so a word shown to
  // several learners at once goes to LibreTranslate in one request rather than several.
  const lookupsInFlight = new Set<string>();
  const pendingLookups = new Set<Promise<void>>();
  // Lets tests wait for the background lookups to finish.
  app.locals.whenWordLookupsIdle = () => Promise.allSettled([...pendingLookups]);

  // Looks words up and caches the result, without anyone waiting on it. The words go out
  // as one request (no per-word retries); words the service answers but can't translate
  // are recorded as misses and skipped for a while. A failed request records nothing, so
  // the words are tried again the next time someone sees them.
  function lookUpInBackground(language: string, words: string[]): void {
    if (!libreTranslate.configured) return;
    const key = (word: string) => `${language}\u0000${word}`;
    const fresh = words.filter((word) => !lookupsInFlight.has(key(word)));
    if (!fresh.length) return;
    for (const word of fresh) lookupsInFlight.add(key(word));

    const task = (async () => {
      try {
        const misses = await database.getRecentWordTranslationMisses(language, fresh);
        const toLookUp = fresh.filter((word) => !misses.has(word));
        if (!toLookUp.length) return;
        const { translations, untranslatable } = await libreTranslate.translateWords(
          toLookUp,
          language
        );
        await database.upsertWordTranslations(
          Object.entries(translations).map(([word, translation]) => ({
            language,
            word,
            translation,
            source: "libretranslate"
          }))
        );
        await database.recordWordTranslationMisses(language, untranslatable);
      } catch (error: any) {
        logger.warn("word_lookup_failed", {
          language,
          words: fresh.length,
          error: error?.message || String(error)
        });
      } finally {
        for (const word of fresh) lookupsInFlight.delete(key(word));
      }
    })();
    pendingLookups.add(task);
    task.finally(() => pendingLookups.delete(task));
  }

  // Word hints for exercises and stories. Answers from the cache only, right away: missing
  // words are looked up in the background and are there the next time. LibreTranslate
  // scales to zero, and waiting here for its cold start kept learners waiting 10-15 s.
  app.get("/api/dictionary/batch", requireAuth, async (req: any, res: any) => {
    const lang = String(req.query.lang || "").trim().toLowerCase();
    const wordsParam = String(req.query.words || "").trim();

    if (!lang || !wordsParam) {
      return res.status(400).json({ error: "lang and words are required" });
    }
    if (!LIBRE_LANG_CODES[lang]) {
      return res.status(400).json({ error: "unsupported language" });
    }

    const words = [
      ...new Set(
        wordsParam
          .split(",")
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length >= 2 && w.length <= 60)
          // English in a course with its own script (a cloze sentence's translation in
          // parentheses) has nothing to look up.
          .filter((w: string) => isCourseScriptWord(lang, w))
      )
    ].slice(0, 50);

    if (!words.length) return res.json({ translations: {} });

    const translations = await database.getCachedWordTranslations(lang, words);
    const uncached = words.filter((w: string) => !(w in translations));
    if (uncached.length) lookUpInBackground(lang, uncached);

    return res.json({ translations });
  });

  app.get("/api/admin/word-translations/counts", requireAuth, async (req: any, res: any) => {
    if (!await canAccessAdminRoutes(req.authUserId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(await database.getWordTranslationCounts());
  });

  // Re-seeds the content entries from the language files, keeping what LibreTranslate
  // added. `scope: "all"` empties the whole cache first, LibreTranslate rows and misses
  // included, for when those need to be fetched again.
  app.post("/api/admin/word-translations/rebuild", requireAuth, async (req: any, res: any) => {
    if (!await canAccessAdminRoutes(req.authUserId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const scope = req.body?.scope === "all" ? "all" : "content";
    const count = scope === "all"
      ? await rebuildAllWordTranslations(database)
      : await rebuildContentWordTranslations(database);
    return res.json({ rebuilt: count, scope });
  });

  // Pre-translates a course's words that aren't cached yet, one chunk per request, so
  // learners don't wait for LibreTranslate. The admin page calls it repeatedly, passing
  // back `cursor`, until `done`. The cursor walks the sorted word list rather than the
  // missing words, so each run ends. Words LibreTranslate couldn't translate recently are
  // skipped, and new ones are recorded as misses. When the service fails (a cold start can
  // outlast the timeout), it answers 503 and the cursor stays put, so the same chunk can
  // be retried.
  app.post("/api/admin/word-translations/prefetch", requireAuth, async (req: any, res: any) => {
    if (!await canAccessAdminRoutes(req.authUserId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const language = String(req.body?.language || "").trim().toLowerCase();
    const cursor = Math.max(0, Number.parseInt(String(req.body?.cursor ?? 0), 10) || 0);
    if (!LIBRE_LANG_CODES[language] || language === "english") {
      return res.status(400).json({ error: "Unsupported language" });
    }
    if (!libreTranslate.configured) {
      return res.status(503).json({ error: "LIBRETRANSLATE_URL is not set", code: "NOT_CONFIGURED" });
    }

    try {
      if (!await libreTranslate.supports(language)) {
        return res.status(400).json({
          error: `LibreTranslate has no ${language} model`,
          code: "NO_MODEL"
        });
      }
      const words = collectCourseWords(language);
      const cached = await database.listCachedWords(language);
      const misses = await database.getRecentWordTranslationMisses(language);
      const known = (word: string) => cached.has(word) || misses.has(word);
      const chunk: string[] = [];
      let next = cursor;
      while (next < words.length && chunk.length < PREFETCH_CHUNK) {
        if (!known(words[next])) chunk.push(words[next]);
        next += 1;
      }

      const translations = await libreTranslate.translateBatch(chunk, language, {
        timeoutMs: PREFETCH_TIMEOUT_MS
      });
      const translated = await database.upsertWordTranslations(
        Object.entries(translations).map(([word, translation]) => ({
          language,
          word,
          translation,
          source: "libretranslate"
        }))
      );
      await database.recordWordTranslationMisses(
        language,
        chunk.filter((word) => !(word in translations))
      );
      const remaining = words.slice(next).filter((word) => !known(word)).length;
      return res.json({
        total: words.length,
        cursor: next,
        done: next >= words.length,
        checked: chunk.length,
        translated,
        remaining
      });
    } catch (error: any) {
      logger.warn("word_prefetch_failed", { language, cursor, error: error?.message || String(error) });
      return res.status(503).json({
        error: "LibreTranslate didn't answer in time, try again",
        code: "UNAVAILABLE"
      });
    }
  });
}

module.exports = {
  registerCourseRoutes
};
