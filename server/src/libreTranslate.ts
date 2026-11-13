// LibreTranslate client for word lookups the content doesn't cover.
//
// In production LibreTranslate runs as its own private Cloud Run service (see
// deploy/libretranslate/). It scales to zero, so the first lookup after it has been idle
// waits for a cold start while the models load. To keep that cheap, a batch of words goes
// out as one /translate request, and a failed request ends the batch rather than being
// retried word by word. The words are looked up again the next time someone sees them.
//
// On Cloud Run (K_SERVICE is set) each request carries an ID token from the metadata
// server, which the private service checks against its run.invoker binding.

// Course id → LibreTranslate language code. Whether a course can actually be looked up
// depends on which models the service has; see supportedLanguages() below.
const LIBRE_LANG_CODES: Record<string, string> = {
  russian: "ru",
  spanish: "es",
  swedish: "sv",
  italian: "it",
  french: "fr",
  german: "de",
  english: "en"
};

const TRANSLATE_TIMEOUT_MS = 20_000;
// How long the service's language list is trusted. It changes only when the image is
// rebuilt with more models, so an hour picks that up without restarting the API.
const LANGUAGES_TTL_MS = 60 * 60 * 1000;
// Cloud Run ID tokens last an hour; fetch a new one well before that.
const ID_TOKEN_TTL_MS = 45 * 60 * 1000;
const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

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

interface LibreTranslateOptions {
  url?: string;
  apiKey?: string;
  // Attach a Cloud Run ID token. Defaults to "running on Cloud Run".
  useIdToken?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: { warn: (message: string, meta?: Record<string, unknown>) => void };
}

function createLibreTranslate(options: LibreTranslateOptions = {}) {
  const url = String(options.url || "").replace(/\/$/, "");
  const apiKey = String(options.apiKey || "").trim();
  const useIdToken = options.useIdToken ?? Boolean(process.env.K_SERVICE);
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || Date.now;
  const logger = options.logger;

  let idToken: { value: string; expiresAt: number } | null = null;
  let languages: { codes: Set<string>; expiresAt: number } | null = null;

  async function authHeaders(): Promise<Record<string, string>> {
    if (!useIdToken) return {};
    if (!idToken || idToken.expiresAt <= now()) {
      const audience = new URL(url).origin;
      const response = await fetchImpl(
        `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`,
        { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) }
      );
      if (!response.ok) throw new Error(`Metadata server returned ${response.status}`);
      idToken = { value: (await response.text()).trim(), expiresAt: now() + ID_TOKEN_TTL_MS };
    }
    return { Authorization: `Bearer ${idToken.value}` };
  }

  // Source languages the service can translate into English. Cached, so a course whose
  // model isn't installed never wakes the service up just to be turned away.
  async function supportedLanguages(): Promise<Set<string>> {
    if (languages && languages.expiresAt > now()) return languages.codes;
    const response = await fetchImpl(`${url}/languages`, {
      headers: await authHeaders(),
      signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`LibreTranslate /languages returned ${response.status}`);
    const list = (await response.json()) as Array<{ code?: string; targets?: string[] }>;
    const codes = new Set(
      list
        .filter((entry) => entry.code && entry.code !== "en" && entry.targets?.includes("en"))
        .map((entry) => String(entry.code))
    );
    languages = { codes, expiresAt: now() + LANGUAGES_TTL_MS };
    return codes;
  }

  // Whether the service can translate this course into English. Throws when the service
  // can't be reached.
  async function supports(language: string): Promise<boolean> {
    const source = LIBRE_LANG_CODES[language];
    if (!url || !source) return false;
    return (await supportedLanguages()).has(source);
  }

  // Translates words of a course language into English in one request. Returns only
  // usable translations; throws when the service fails or doesn't answer in time.
  async function translateBatch(
    words: string[],
    language: string,
    { timeoutMs = TRANSLATE_TIMEOUT_MS }: { timeoutMs?: number } = {}
  ): Promise<Record<string, string>> {
    const source = LIBRE_LANG_CODES[language];
    if (!url || !source || !words.length) return {};

    const response = await fetchImpl(`${url}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        q: words,
        source,
        target: "en",
        format: "text",
        ...(apiKey ? { api_key: apiKey } : {})
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`LibreTranslate /translate returned ${response.status}`);

    const data = (await response.json()) as { translatedText?: string | string[] };
    const translated = Array.isArray(data.translatedText)
      ? data.translatedText
      : [data.translatedText];

    const result: Record<string, string> = {};
    words.forEach((word, index) => {
      const translation = normalizeTranslation(String(translated[index] || ""));
      if (isUsableTranslation(word, translation)) result[word] = translation;
    });
    return result;
  }

  // The lookup the app uses: like translateBatch, but a failure (or a course without a
  // model) just returns nothing, and the words are looked up the next time around.
  async function translateWords(words: string[], language: string): Promise<Record<string, string>> {
    if (!url || !LIBRE_LANG_CODES[language] || !words.length) return {};
    try {
      if (!(await supports(language))) return {};
      return await translateBatch(words, language);
    } catch (error) {
      logger?.warn("LibreTranslate lookup failed", {
        language,
        words: words.length,
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  return { configured: Boolean(url), supports, translateBatch, translateWords };
}

module.exports = { LIBRE_LANG_CODES, createLibreTranslate, normalizeTranslation, isUsableTranslation };
