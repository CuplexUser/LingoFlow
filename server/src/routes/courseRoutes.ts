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

  const LANG_CODES: Record<string, string> = {
    russian: "ru",
    spanish: "es",
    swedish: "sv",
    italian: "it",
    english: "en"
  };

  // Loose Cyrillic → Latin romanization used to detect when MyMemory returns
  // a transliteration ("menya") instead of a real translation ("me").
  const CYR_TO_LAT: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "ye", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };

  function romanizeCyrillic(word: string): string {
    return word.toLowerCase().split("").map((c) => CYR_TO_LAT[c] ?? c).join("");
  }

  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
        prev = temp;
      }
    }
    return dp[n];
  }

  function normalizeTranslation(raw: string): string {
    // Strip trailing punctuation, collapse ALL-CAPS, lowercase the first character
    // (MyMemory often capitalizes single-word translations like "Morning").
    let t = raw.replace(/[.,…]+$/, "").trim();
    if (t === t.toUpperCase() && t.length > 1) t = t.toLowerCase();
    t = t.charAt(0).toLowerCase() + t.slice(1);
    return t;
  }

  function isUsableTranslation(word: string, translation: string): boolean {
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(translation)) return false;
    // Must not be identical to the source
    if (translation.toLowerCase() === word.toLowerCase()) return false;
    // Detect Cyrillic transliterations: if the romanized source is very close
    // to the translation, MyMemory just phoneticized it instead of translating
    if (/[Ѐ-ӿ]/.test(word) && !/\s/.test(translation)) {
      const romanized = romanizeCyrillic(word);
      const dist = levenshtein(romanized, translation.toLowerCase());
      const similarity = 1 - dist / Math.max(romanized.length, translation.length);
      if (similarity >= 0.75) return false;
    }
    return true;
  }

  app.get("/api/dictionary/batch", requireAuth, async (req: any, res: any) => {
    const lang = String(req.query.lang || "").trim().toLowerCase();
    const wordsParam = String(req.query.words || "").trim();

    if (!lang || !wordsParam) {
      return res.status(400).json({ error: "lang and words are required" });
    }
    const langCode = LANG_CODES[lang];
    if (!langCode) {
      return res.status(400).json({ error: "unsupported language" });
    }

    const words = [
      ...new Set(
        wordsParam
          .split(",")
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length >= 2 && w.length <= 60)
      )
    ].slice(0, 50);

    if (!words.length) return res.json({ translations: {} });

    const cached = database.getCachedWordTranslations(lang, words);
    const uncached = words.filter((w: string) => !(w in cached));
    const translations: Record<string, string> = { ...cached };

    for (const word of uncached) {
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${langCode}|en`;
        const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
        if (!response.ok) continue;
        const data = await response.json() as {
          responseStatus: number;
          responseData: { translatedText: string };
        };
        if (data.responseStatus !== 200) continue;
        const translation = normalizeTranslation(String(data.responseData?.translatedText || ""));
        if (!isUsableTranslation(word, translation)) continue;
        database.upsertWordTranslation(lang, word, translation);
        translations[word] = translation;
      } catch {
        // skip failed lookups silently
      }
    }

    return res.json({ translations });
  });
}

module.exports = {
  registerCourseRoutes
};
