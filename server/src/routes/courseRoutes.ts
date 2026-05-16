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

  // Language-pair specific MarianMT models — available on HuggingFace serverless Inference API
  const HF_TRANSLATION_MODELS: Record<string, string> = {
    russian: "Helsinki-NLP/opus-mt-ru-en",
    spanish: "Helsinki-NLP/opus-mt-es-en",
    swedish: "Helsinki-NLP/opus-mt-sv-en",
    italian: "Helsinki-NLP/opus-mt-it-en"
  };

  const LIBRE_LANG_CODES: Record<string, string> = {
    russian: "ru",
    spanish: "es",
    swedish: "sv",
    italian: "it",
    english: "en"
  };

  const HF_API_TOKEN = String(process.env.HUGGINGFACE_API_TOKEN || "").trim();
  const LIBRE_TRANSLATE_URL = String(process.env.LIBRETRANSLATE_URL || "").replace(/\/$/, "");
  const LIBRE_TRANSLATE_API_KEY = String(process.env.LIBRETRANSLATE_API_KEY || "").trim();

  function normalizeTranslation(raw: string): string {
    let t = raw.replace(/[.,…]+$/, "").trim();
    if (t === t.toUpperCase() && t.length > 1) t = t.toLowerCase();
    t = t.charAt(0).toLowerCase() + t.slice(1);
    return t;
  }

  function isUsableTranslation(word: string, translation: string): boolean {
    if (!/[a-zA-Z]/.test(translation)) return false;
    if (translation.toLowerCase() === word.toLowerCase()) return false;
    return true;
  }

  async function translateBatchWithHF(words: string[], srcLang: string): Promise<Record<string, string>> {
    if (!HF_API_TOKEN || !words.length) return {};
    const model = HF_TRANSLATION_MODELS[srcLang];
    if (!model) return {};
    try {
      const response = await fetch(
        `https://router.huggingface.co/hf-inference/models/${model}`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${HF_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: words }),
          signal: AbortSignal.timeout(15000)
        }
      );
      if (!response.ok) return {};
      const data = await response.json() as Array<{ translation_text: string }>;
      if (!Array.isArray(data)) return {};
      const result: Record<string, string> = {};
      for (let i = 0; i < words.length; i++) {
        const raw = data[i]?.translation_text;
        if (!raw) continue;
        const translation = normalizeTranslation(String(raw));
        if (isUsableTranslation(words[i], translation)) result[words[i]] = translation;
      }
      return result;
    } catch {
      return {};
    }
  }

  async function translateWithLibreTranslate(word: string, srcLang: string): Promise<string | null> {
    if (!LIBRE_TRANSLATE_URL) return null;
    const libreCode = LIBRE_LANG_CODES[srcLang];
    if (!libreCode) return null;
    try {
      const response = await fetch(`${LIBRE_TRANSLATE_URL}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: word, source: libreCode, target: "en", format: "text",
          ...(LIBRE_TRANSLATE_API_KEY ? { api_key: LIBRE_TRANSLATE_API_KEY } : {})
        }),
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) return null;
      const data = await response.json() as { translatedText?: string };
      const translation = normalizeTranslation(String(data.translatedText || ""));
      return isUsableTranslation(word, translation) ? translation : null;
    } catch {
      return null;
    }
  }

  app.get("/api/dictionary/batch", requireAuth, async (req: any, res: any) => {
    const lang = String(req.query.lang || "").trim().toLowerCase();
    const wordsParam = String(req.query.words || "").trim();

    if (!lang || !wordsParam) {
      return res.status(400).json({ error: "lang and words are required" });
    }
    if (!HF_TRANSLATION_MODELS[lang] && !LIBRE_LANG_CODES[lang]) {
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

    if (uncached.length) {
      const nllbResults = await translateBatchWithHF(uncached, lang);
      for (const word of uncached) {
        if (nllbResults[word]) {
          database.upsertWordTranslation(lang, word, nllbResults[word]);
          translations[word] = nllbResults[word];
        } else {
          const libreResult = await translateWithLibreTranslate(word, lang);
          if (libreResult) {
            database.upsertWordTranslation(lang, word, libreResult);
            translations[word] = libreResult;
          }
        }
      }
    }

    return res.json({ translations });
  });
}

module.exports = {
  registerCourseRoutes
};
