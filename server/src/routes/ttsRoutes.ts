const crypto = require("crypto");
const { GoogleAuth } = require("google-auth-library");

// Text-to-speech with Gemini TTS (gemini-3.8-flash-lite-tts through the Gemini API), for
// clients whose built-in voices sound robotic (Android's system TTS especially). Audio
// is WAV at normal speed; clients change the speed on playback, so one cached clip
// serves every rate.
//
// A clip takes a few seconds to generate, so each one is cached in memory and, when
// TTS_CACHE_BUCKET is set, in Cloud Storage: a sentence is generated (and billed) once,
// not once per learner, and only when someone first plays it. Cloud Storage uses
// Application Default Credentials (the runtime service account on Cloud Run). Without
// GEMINI_API_KEY the endpoint answers 503 and clients fall back to their own TTS.

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const STORAGE_URL = "https://storage.googleapis.com/storage/v1/b";
const UPLOAD_URL = "https://storage.googleapis.com/upload/storage/v1/b";
const DEFAULT_MODEL = "gemini-3.8-flash-lite-tts";
const DEFAULT_VOICE = "Kore";
const MAX_TEXT_LENGTH = 500;
const MEMORY_CACHE_BYTES = 16 * 1024 * 1024;
// Free-tier quotas are small: a few generations at a time, and a pause after a 429.
const MAX_CONCURRENT_GENERATIONS = 3;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
// Caps on new clips per UTC day (cached clips are unlimited), so the bill has a ceiling
// even if someone scripts the endpoint. The course is ~300k characters in total, so
// real learners rarely reach them. Per instance; Cloud Run runs at most 3.
const DEFAULT_DAILY_GENERATIONS = 1_000;
const DAILY_GENERATIONS_PER_USER = 150;

// The course languages. Gemini detects the language from the text; the tag only
// validates the request and picks a voice override.
const LANGUAGES = ["en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "ru-RU", "sv-SE"];

class TtsUnavailableError extends Error {}
class TtsBusyError extends Error {}

// TTS_VOICES="ru-RU=Charon,sv-SE=Leda" picks another Gemini voice per language.
function parseVoiceOverrides(value: string): Record<string, string> {
  const voices: Record<string, string> = {};
  for (const pair of value.split(",")) {
    const [lang, name] = pair.split("=").map((part) => part.trim());
    if (lang && name) voices[lang] = name;
  }
  return voices;
}

/** Raw 16-bit mono PCM as a playable WAV file. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Keeps the most recently used clips up to a byte budget (Map iteration order is
// insertion order, so re-inserting on a hit moves a clip to the end).
function createMemoryCache(maxBytes: number) {
  const clips = new Map<string, Buffer>();
  let bytes = 0;
  return {
    get(key: string): Buffer | null {
      const clip = clips.get(key);
      if (!clip) return null;
      clips.delete(key);
      clips.set(key, clip);
      return clip;
    },
    set(key: string, clip: Buffer) {
      if (clip.length > maxBytes) return;
      const existing = clips.get(key);
      if (existing) {
        bytes -= existing.length;
        clips.delete(key);
      }
      clips.set(key, clip);
      bytes += clip.length;
      for (const [oldKey, oldClip] of clips) {
        if (bytes <= maxBytes) break;
        clips.delete(oldKey);
        bytes -= oldClip.length;
      }
    }
  };
}

// Runs at most `limit` tasks at once; the rest wait their turn.
function createLimiter(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await task();
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

function createGeminiTts({ apiKey, model }: { apiKey: string; model: string }) {
  const limit = createLimiter(MAX_CONCURRENT_GENERATIONS);
  let pausedUntil = 0;

  async function generate(text: string, voice: string): Promise<Buffer> {
    if (!apiKey) throw new TtsUnavailableError("GEMINI_API_KEY is not set");
    if (Date.now() < pausedUntil) throw new TtsBusyError("Gemini TTS is rate limited");
    return limit(async () => {
      const response = await fetch(INTERACTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model,
          input: [{ type: "user_input", content: [{ type: "text", text }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] }
        })
      });
      if (response.status === 429) {
        pausedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        throw new TtsBusyError("Gemini TTS is rate limited");
      }
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`Gemini TTS error ${response.status}: ${detail}`);
      }
      const payload = await response.json() as any;
      const blocks = (payload.steps || [])
        .flatMap((step: any) => (step.type === "model_output" ? step.content || [] : []))
        .filter((block: any) => block.type === "audio" && block.data);
      const block = blocks[blocks.length - 1] || payload.output_audio;
      if (!block?.data) throw new Error("Gemini TTS returned no audio");
      const audio = Buffer.from(block.data, "base64");
      const mimeType = String(block.mime_type || "audio/wav");
      // Headerless 16-bit samples are wrapped so clients can play them.
      if (/l16|pcm/i.test(mimeType)) {
        return pcmToWav(audio, Number(/rate=(\d+)/.exec(mimeType)?.[1] || 24_000));
      }
      return audio;
    });
  }

  return { generate };
}

function createBucketCache({ bucket, logger }: { bucket: string; logger: any }) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

  async function authHeader(): Promise<string> {
    const token = await auth.getAccessToken();
    if (!token) throw new Error("No Google access token");
    return `Bearer ${token}`;
  }

  // Cloud Storage failures only cost a regeneration, so they are logged, not thrown.
  async function read(objectName: string): Promise<Buffer | null> {
    if (!bucket) return null;
    try {
      const response = await fetch(
        `${STORAGE_URL}/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`,
        { headers: { Authorization: await authHeader() } }
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Cloud Storage read error ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error: any) {
      logger.warn("tts_cache_read_failed", { error: error?.message || String(error) });
      return null;
    }
  }

  async function write(objectName: string, clip: Buffer): Promise<void> {
    if (!bucket) return;
    try {
      const response = await fetch(
        `${UPLOAD_URL}/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
        {
          method: "POST",
          headers: { Authorization: await authHeader(), "Content-Type": "audio/wav" },
          body: clip
        }
      );
      if (!response.ok) throw new Error(`Cloud Storage write error ${response.status}`);
    } catch (error: any) {
      logger.warn("tts_cache_write_failed", { error: error?.message || String(error) });
    }
  }

  return { read, write };
}

// Counts new clips per UTC day, overall and per user.
function createDailyBudget(total: number, perUser: number) {
  let day = "";
  let used = 0;
  const usedByUser = new Map<string, number>();
  return {
    take(userId: string): boolean {
      const today = new Date().toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = 0;
        usedByUser.clear();
      }
      const userUsed = usedByUser.get(userId) || 0;
      if (used >= total || userUsed >= perUser) return false;
      used += 1;
      usedByUser.set(userId, userUsed + 1);
      return true;
    }
  };
}

function makeUserRateLimiter(maxRequests: number, windowMs: number) {
  const requests = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (requests.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= maxRequests) {
      requests.set(key, recent);
      return false;
    }
    recent.push(now);
    requests.set(key, recent);
    return true;
  };
}

function registerTtsRoutes(app: any, deps: any): void {
  const { requireAuth, logger } = deps;
  const disabled = ["1", "true"].includes(String(process.env.TTS_DISABLED || "").trim().toLowerCase());
  const model = String(process.env.TTS_MODEL || "").trim() || DEFAULT_MODEL;
  const voiceOverrides = parseVoiceOverrides(String(process.env.TTS_VOICES || ""));
  const gemini = createGeminiTts({ apiKey: String(process.env.GEMINI_API_KEY || "").trim(), model });
  const bucket = createBucketCache({ bucket: String(process.env.TTS_CACHE_BUCKET || "").trim(), logger });
  const memory = createMemoryCache(MEMORY_CACHE_BYTES);
  const inFlight = new Map<string, Promise<Buffer>>();
  // Generous for story playback and lesson prefetching.
  const allowRequest = makeUserRateLimiter(120, 60_000);
  const dailyGenerations = Number(process.env.TTS_DAILY_GENERATION_LIMIT) || DEFAULT_DAILY_GENERATIONS;
  const budget = createDailyBudget(dailyGenerations, DAILY_GENERATIONS_PER_USER);

  // The same text and voice always map to the same object, so a clip is generated once.
  // A request that times out on the client still finishes here and fills the cache.
  async function getClip(text: string, voice: string, userId: string): Promise<Buffer> {
    const hash = crypto.createHash("sha256").update(`${model}\n${voice}\n${text}`).digest("hex");
    const objectName = `tts/v2/${model}/${voice}/${hash}.wav`;
    const cached = memory.get(objectName);
    if (cached) return cached;

    let pending = inFlight.get(objectName);
    if (!pending) {
      pending = (async () => {
        let clip = await bucket.read(objectName);
        if (!clip) {
          if (!budget.take(userId)) throw new TtsBusyError("Daily generation limit reached");
          clip = await gemini.generate(text, voice) as Buffer;
          await bucket.write(objectName, clip);
        }
        memory.set(objectName, clip);
        return clip;
      })();
      inFlight.set(objectName, pending);
      pending.then(
        () => inFlight.delete(objectName),
        () => inFlight.delete(objectName)
      );
    }
    return pending;
  }

  app.get("/api/tts", requireAuth, async (req: any, res: any) => {
    const text = String(req.query.text || "").replace(/\s+/g, " ").trim();
    const lang = String(req.query.lang || "").trim();
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Text must be 1 to ${MAX_TEXT_LENGTH} characters` });
    }
    if (!LANGUAGES.includes(lang)) {
      return res.status(400).json({ error: "Unsupported language", code: "TTS_UNSUPPORTED_LANGUAGE" });
    }
    if (disabled) {
      return res.status(503).json({ error: "Text-to-speech is not configured", code: "TTS_UNAVAILABLE" });
    }
    if (!allowRequest(String(req.authUserId))) {
      return res.status(429).json({ error: "Too many speech requests" });
    }

    try {
      const clip = await getClip(text, voiceOverrides[lang] || DEFAULT_VOICE, String(req.authUserId));
      res.set("Content-Type", "audio/wav");
      // The URL holds the whole input, so a response never changes.
      res.set("Cache-Control", "private, max-age=31536000, immutable");
      return res.send(clip);
    } catch (error: any) {
      if (error instanceof TtsBusyError) {
        return res.status(503).json({ error: "Text-to-speech is busy, try again shortly", code: "TTS_BUSY" });
      }
      const unavailable = error instanceof TtsUnavailableError;
      (unavailable ? logger.warn : logger.error)("tts_failed", {
        requestId: req.requestId,
        lang,
        error: error?.message || String(error)
      });
      return unavailable
        ? res.status(503).json({ error: "Text-to-speech is not configured", code: "TTS_UNAVAILABLE" })
        : res.status(502).json({ error: "Text-to-speech failed" });
    }
  });
}

module.exports = {
  registerTtsRoutes
};
