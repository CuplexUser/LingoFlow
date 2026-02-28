const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const database = require("./db");
const logger = require("./logger");
const {
  LANGUAGES,
  getCourseOverview,
  generateSession,
  LEVEL_XP_MULTIPLIER
} = require("./data");

const port = 4000;
const AUTH_SECRET = process.env.LINGOFLOW_AUTH_SECRET || "lingoflow-dev-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "http://localhost:5173";
const EMAIL_FROM = process.env.EMAIL_FROM || "LingoFlow <no-reply@lingoflow.local>";
const EMAIL_VERIFICATION_TTL_HOURS = 24;
const GOOGLE_OAUTH_CLIENT_ID = String(
  process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ""
).trim();
const GOOGLE_OAUTH_CLIENT_SECRET = String(
  process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ""
).trim();
const GOOGLE_OAUTH_REDIRECT_URI = String(
  process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:4000/api/auth/google/callback"
).trim();
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const googleOauthClient = (GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET)
  ? new OAuth2Client(
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI
  )
  : null;

function emailFingerprint(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "none";
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function normalizeSentence(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAnswerMatch(question, submitted) {
  const expectedVariants = [question.answer, ...(question.acceptedAnswers || [])]
    .map((value) => normalizeSentence(value))
    .filter(Boolean);
  const normalizedSubmitted = normalizeSentence(submitted);
  return expectedVariants.includes(normalizedSubmitted);
}

function classifyError(question, submitted) {
  if (question.type === "build_sentence") {
    const expectedTokens = normalizeSentence(question.answer).split(" ").filter(Boolean);
    const actualTokens = normalizeSentence(submitted).split(" ").filter(Boolean);
    if (!actualTokens.length) return "missing_answer";
    const expectedSorted = [...expectedTokens].sort().join(" ");
    const actualSorted = [...actualTokens].sort().join(" ");
    if (expectedSorted === actualSorted && expectedTokens.join(" ") !== actualTokens.join(" ")) {
      return "word_order";
    }
    if (actualTokens.length < expectedTokens.length) return "missing_word";
    return "grammar_or_vocab";
  }
  if (question.type === "dictation_sentence") return "dictation_mismatch";
  if (question.type === "cloze_sentence") return "cloze_choice";
  return "wrong_option";
}

function evaluateAttempt(question, attempt) {
  let submitted = "";
  if (question.type === "build_sentence") submitted = attempt?.builtSentence || "";
  if (question.type === "dictation_sentence") {
    submitted = attempt?.builtSentence || attempt?.textAnswer || "";
  }
  if (question.type === "mc_sentence" || question.type === "dialogue_turn") {
    submitted = attempt?.selectedOption || "";
  }
  if (question.type === "cloze_sentence") {
    submitted = attempt?.selectedOption || "";
    const correct = normalizeSentence(submitted) === normalizeSentence(question.clozeAnswer || "");
    return {
      correct,
      errorType: correct ? "none" : classifyError(question, submitted),
      submitted
    };
  }

  const correct = isAnswerMatch(question, submitted);
  return {
    correct,
    errorType: correct ? "none" : classifyError(question, submitted),
    submitted
  };
}

function calculateXp({
  score,
  maxScore,
  mistakes,
  hintsUsed,
  revealedAnswers,
  difficultyLevel
}) {
  const accuracy = maxScore > 0 ? score / maxScore : 0;
  const baseXp = 16 + maxScore * 2;
  const levelMultiplier = LEVEL_XP_MULTIPLIER[difficultyLevel] || 1;
  const challengeBonus = accuracy >= 0.9 ? 8 : accuracy >= 0.75 ? 4 : 0;
  const penalty = (accuracy < 0.5 ? 6 : 0) + mistakes * 2 + hintsUsed + revealedAnswers * 3;
  const xpGained = Math.max(4, Math.round(baseXp * levelMultiplier + challengeBonus - penalty));
  return { accuracy, xpGained };
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTokenPayload(payloadJson) {
  return crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(payloadJson)
    .digest("base64url");
}

function createAuthToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const payloadJson = JSON.stringify({
    sub: Number(userId),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  });
  const payloadPart = base64UrlEncode(payloadJson);
  const signature = signTokenPayload(payloadJson);
  return `v1.${payloadPart}.${signature}`;
}

function parseAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const payloadPart = parts[1];
  const signature = parts[2];

  let payloadJson = "";
  try {
    payloadJson = base64UrlDecode(payloadPart);
  } catch (_error) {
    return null;
  }

  const expectedSignature = signTokenPayload(payloadJson);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload = null;
  try {
    payload = JSON.parse(payloadJson);
  } catch (_error) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload || !Number.isInteger(payload.sub) || !Number.isInteger(payload.exp)) return null;
  if (payload.exp <= now) return null;
  return payload;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function createGoogleOauthState() {
  const now = Math.floor(Date.now() / 1000);
  const payloadJson = JSON.stringify({
    nonce: crypto.randomUUID(),
    iat: now,
    exp: now + GOOGLE_OAUTH_STATE_TTL_SECONDS
  });
  const payloadPart = base64UrlEncode(payloadJson);
  const signature = signTokenPayload(payloadJson);
  return `v1.${payloadPart}.${signature}`;
}

function parseGoogleOauthState(state) {
  if (!state || typeof state !== "string") return null;
  const parts = state.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const payloadPart = parts[1];
  const signature = parts[2];

  let payloadJson = "";
  try {
    payloadJson = base64UrlDecode(payloadPart);
  } catch (_error) {
    return null;
  }

  const expectedSignature = signTokenPayload(payloadJson);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload = null;
  try {
    payload = JSON.parse(payloadJson);
  } catch (_error) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload || !payload.nonce || !Number.isInteger(payload.exp)) return null;
  if (payload.exp <= now) return null;
  return payload;
}

function buildAuthReturnUrl(params = {}) {
  const baseUrl = String(PUBLIC_APP_URL || "").replace(/\/$/, "");
  const target = new URL(`${baseUrl}/login`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      target.searchParams.set(key, String(value));
    }
  });
  return target.toString();
}

function isGoogleOauthConfigured() {
  return Boolean(googleOauthClient && GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);
}

async function getGoogleProfileFromAuthorizationCode(code) {
  if (!isGoogleOauthConfigured()) {
    throw new Error("Google OAuth is not configured");
  }
  if (!code) {
    throw new Error("Missing authorization code");
  }

  const { tokens } = await googleOauthClient.getToken(code);
  const idToken = String(tokens?.id_token || "").trim();
  if (!idToken) {
    throw new Error("Google did not return an ID token");
  }

  const ticket = await googleOauthClient.verifyIdToken({
    idToken,
    audience: GOOGLE_OAUTH_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified) {
    throw new Error("Google account email is not verified");
  }

  return {
    email: String(payload.email).toLowerCase(),
    displayName: String(payload.name || payload.given_name || "Learner")
  };
}

function buildEmailVerificationLink(token) {
  const baseUrl = String(PUBLIC_APP_URL || "").replace(/\/$/, "");
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

function getEmailTransporter() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const portRaw = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass || !Number.isFinite(portRaw)) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: portRaw,
    secure: Boolean(process.env.SMTP_SECURE === "true"),
    auth: {
      user,
      pass
    }
  });
}

async function sendVerificationEmail({ toEmail, displayName, token }) {
  const link = buildEmailVerificationLink(token);
  const transporter = getEmailTransporter();
  const subject = "Verify your LingoFlow account";
  const safeName = String(displayName || "Learner");
  const text = [
    `Hi ${safeName},`,
    "",
    "Welcome to LingoFlow! Please verify your email by opening this link:",
    link,
    "",
    "This link expires in 24 hours."
  ].join("\n");

  if (!transporter) {
    console.log(`[EMAIL_DEV] Verify ${toEmail}: ${link}`);
    return { delivered: false, link };
  }

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: toEmail,
    subject,
    text,
    html: `
      <p>Hi ${safeName},</p>
      <p>Welcome to LingoFlow. Confirm your email using the button below:</p>
      <p><a href="${link}" style="padding:10px 14px;border-radius:8px;background:#292524;color:#fff;text-decoration:none;">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
    `
  });
  return { delivered: true, link };
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    const headerRequestId = String(req.headers["x-request-id"] || "").trim();
    req.requestId = headerRequestId || crypto.randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.use((req, _res, next) => {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) {
      req.authUserId = null;
      req.authFromToken = false;
      return next();
    }
    const token = header.slice(7).trim();
    const payload = parseAuthToken(token);
    if (!payload) {
      req.authUserId = null;
      req.authFromToken = false;
      return next();
    }
    req.authUserId = payload.sub;
    req.authFromToken = true;
    return next();
  });
  app.use(logger.requestLogger);

  function requireAuth(req, res, next) {
    if (!req.authFromToken || !req.authUserId) {
      logger.logAuthEvent("auth_required_rejected", {
        requestId: req.requestId,
        path: req.path
      });
      return res.status(401).json({ error: "Authentication required" });
    }
    return next();
  }

  const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/register", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.displayName || "Learner").trim() || "Learner";

    if (!email || !email.includes("@")) {
      logger.logAuthEvent("register_rejected", {
        requestId: req.requestId,
        reason: "invalid_email",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (password.length < 8) {
      logger.logAuthEvent("register_rejected", {
        requestId: req.requestId,
        reason: "password_too_short",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    if (database.getUserByEmail(email)) {
      logger.logAuthEvent("register_rejected", {
        requestId: req.requestId,
        reason: "email_exists",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(409).json({ error: "Email already registered" });
    }

    try {
      const created = database.createUser({
        email,
        passwordHash: hashPassword(password),
        displayName,
        emailVerified: false,
        authProvider: "local"
      });
      if (!created) {
        return res.status(500).json({ error: "Could not create user" });
      }

      const verifyToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString();
      database.replaceEmailVerification({
        userId: created.id,
        token: verifyToken,
        expiresAt
      });

      await sendVerificationEmail({
        toEmail: created.email,
        displayName: created.displayName,
        token: verifyToken
      });
      logger.logAuthEvent("register_success", {
        requestId: req.requestId,
        userId: created.id,
        emailFingerprint: emailFingerprint(created.email)
      });

      return res.status(201).json({
        ok: true,
        requiresEmailVerification: true,
        message: "Registration successful. Please verify your email before signing in.",
        ...(process.env.NODE_ENV === "test" ? { verificationToken: verifyToken } : {})
      });
    } catch (error) {
      logger.error("register_failed", {
        requestId: req.requestId,
        reason: error.message || "unknown",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(500).json({ error: "Could not register account right now." });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      logger.logAuthEvent("login_rejected", {
        requestId: req.requestId,
        reason: "missing_credentials",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = database.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      logger.logAuthEvent("login_rejected", {
        requestId: req.requestId,
        reason: "invalid_credentials",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!user.emailVerified) {
      logger.logAuthEvent("login_rejected", {
        requestId: req.requestId,
        reason: "email_not_verified",
        userId: user.id,
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(403).json({ error: "Please verify your email before signing in." });
    }

    const token = createAuthToken(user.id);
    logger.logAuthEvent("login_success", {
      requestId: req.requestId,
      userId: user.id,
      emailFingerprint: emailFingerprint(email)
    });
    return res.json({
      token,
      user: database.getUserById(user.id)
    });
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      logger.logAuthEvent("resend_verification_rejected", {
        requestId: req.requestId,
        reason: "invalid_email",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(400).json({ error: "Valid email is required" });
    }

    const user = database.getUserByEmail(email);
    if (!user) {
      logger.logAuthEvent("resend_verification_accepted", {
        requestId: req.requestId,
        reason: "user_not_found",
        emailFingerprint: emailFingerprint(email)
      });
      return res.json({
        ok: true,
        message: "If an unverified account exists for this email, a new verification link has been sent."
      });
    }

    if (user.emailVerified || user.authProvider !== "local") {
      logger.logAuthEvent("resend_verification_accepted", {
        requestId: req.requestId,
        userId: user.id,
        reason: user.emailVerified ? "already_verified" : "non_local_provider",
        emailFingerprint: emailFingerprint(email)
      });
      return res.json({
        ok: true,
        message: "If an unverified account exists for this email, a new verification link has been sent."
      });
    }

    try {
      const verifyToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000
      ).toISOString();
      database.replaceEmailVerification({
        userId: user.id,
        token: verifyToken,
        expiresAt
      });
      await sendVerificationEmail({
        toEmail: user.email,
        displayName: user.displayName,
        token: verifyToken
      });

      logger.logAuthEvent("resend_verification_success", {
        requestId: req.requestId,
        userId: user.id,
        emailFingerprint: emailFingerprint(user.email)
      });
      return res.json({
        ok: true,
        message: "If an unverified account exists for this email, a new verification link has been sent.",
        ...(process.env.NODE_ENV === "test" ? { verificationToken: verifyToken } : {})
      });
    } catch (error) {
      logger.error("resend_verification_failed", {
        requestId: req.requestId,
        reason: error.message || "unknown",
        userId: user.id,
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(500).json({ error: "Could not resend verification email right now." });
    }
  });

  app.get("/api/auth/google/start", (req, res) => {
    if (!isGoogleOauthConfigured()) {
      logger.logAuthEvent("google_oauth_start_rejected", {
        requestId: req.requestId,
        reason: "not_configured"
      });
      return res.redirect(buildAuthReturnUrl({ authError: "Google sign in is not configured." }));
    }

    try {
      const state = createGoogleOauthState();
      const redirectTo = googleOauthClient.generateAuthUrl({
        access_type: "offline",
        prompt: "select_account",
        scope: ["openid", "email", "profile"],
        state
      });
      logger.logAuthEvent("google_oauth_start_success", {
        requestId: req.requestId
      });
      return res.redirect(redirectTo);
    } catch (error) {
      logger.error("google_oauth_start_failed", {
        requestId: req.requestId,
        reason: error.message || "unknown"
      });
      return res.redirect(buildAuthReturnUrl({ authError: "Could not start Google sign in." }));
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const state = String(req.query.state || "").trim();
    const code = String(req.query.code || "").trim();
    const oauthError = String(req.query.error || "").trim();

    if (oauthError) {
      logger.logAuthEvent("google_oauth_callback_rejected", {
        requestId: req.requestId,
        reason: `oauth_error:${oauthError}`
      });
      return res.redirect(buildAuthReturnUrl({ authError: "Google sign in was canceled or denied." }));
    }

    if (!parseGoogleOauthState(state)) {
      logger.logAuthEvent("google_oauth_callback_rejected", {
        requestId: req.requestId,
        reason: "invalid_state"
      });
      return res.redirect(buildAuthReturnUrl({ authError: "Invalid Google sign in state." }));
    }

    try {
      const profile = await getGoogleProfileFromAuthorizationCode(code);
      let user = database.getUserByEmail(profile.email);
      if (!user) {
        user = database.createUser({
          email: profile.email,
          passwordHash: `oauth-google:${crypto.randomUUID()}`,
          displayName: profile.displayName,
          emailVerified: true,
          authProvider: "google"
        });
      } else if (!user.emailVerified) {
        database.markUserEmailVerified(user.id);
      }
      if (!user) {
        throw new Error("Could not create user");
      }

      const token = createAuthToken(user.id);
      logger.logAuthEvent("google_oauth_callback_success", {
        requestId: req.requestId,
        userId: user.id,
        emailFingerprint: emailFingerprint(profile.email)
      });
      return res.redirect(buildAuthReturnUrl({ authToken: token }));
    } catch (error) {
      logger.logAuthEvent("google_oauth_callback_rejected", {
        requestId: req.requestId,
        reason: error.message || "google_oauth_failed"
      });
      return res.redirect(buildAuthReturnUrl({ authError: "Google authentication failed." }));
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.authFromToken) {
      logger.logAuthEvent("me_rejected", {
        requestId: req.requestId,
        reason: "missing_token"
      });
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = database.getUserById(req.authUserId);
    if (!user) {
      logger.logAuthEvent("me_rejected", {
        requestId: req.requestId,
        reason: "user_not_found",
        userId: req.authUserId
      });
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user });
  });

  app.post("/api/auth/verify-email", (req, res) => {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      logger.logAuthEvent("verify_email_rejected", {
        requestId: req.requestId,
        reason: "missing_token"
      });
      return res.status(400).json({ error: "Verification token is required" });
    }

    const user = database.consumeEmailVerificationToken(token);
    if (!user) {
      logger.logAuthEvent("verify_email_rejected", {
        requestId: req.requestId,
        reason: "invalid_or_expired_token"
      });
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }
    logger.logAuthEvent("verify_email_success", {
      requestId: req.requestId,
      userId: user.id
    });

    return res.json({
      ok: true,
      message: "Email verified successfully. You can now sign in."
    });
  });

  app.get("/api/languages", (_req, res) => {
    res.json(LANGUAGES);
  });

  app.get("/api/course", requireAuth, (req, res) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "spanish").toLowerCase();
    const categories = getCourseOverview(language);
    const categoryProgress = database.getCategoryProgress(userId, language);
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

  app.post("/api/session/start", requireAuth, (req, res) => {
    const userId = req.authUserId;
    const { language, category, count } = req.body || {};
    if (!language || !category) {
      return res.status(400).json({ error: "language and category are required" });
    }

    database.pruneExpiredActiveSessions(userId, database.toIsoDate());
    const mastery = database.getCategoryMastery(userId, language, category);
    const settings = database.getSettings(userId);
    const recentAccuracy = database.getRecentCategoryAccuracy(userId, language, category, 5);
    const hints = database.getItemSelectionHints(userId, language, category, database.toIsoDate());
    const session = generateSession({
      language,
      category,
      mastery,
      recentAccuracy,
      selfRatedLevel: settings.selfRatedLevel,
      dueItemIds: hints.dueItemIds,
      weakItemIds: hints.weakItemIds,
      count: Number.isInteger(count) ? Math.max(6, Math.min(15, count)) : 10
    });

    if (!session.questions.length) {
      return res.status(404).json({ error: "No exercises found for this category" });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = database.toIsoDate(new Date(Date.now() + (1000 * 60 * 60 * 24 * 2)));
    database.createActiveSession({
      userId,
      sessionId,
      language,
      category,
      difficultyLevel: session.recommendedLevel,
      questions: session.questions,
      expiresAt
    });

    return res.json({
      sessionId,
      category,
      language,
      recommendedLevel: session.recommendedLevel,
      difficultyMultiplier: session.difficultyMultiplier,
      questions: session.questions
    });
  });

  app.get("/api/settings", requireAuth, (req, res) => {
    const userId = req.authUserId;
    res.json(database.getSettings(userId));
  });

  app.put("/api/settings", requireAuth, (req, res) => {
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
      focusArea
    } = req.body || {};

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
      focusArea: String(focusArea || "").trim()
    });

    res.json(row);
  });

  app.get("/api/progress", requireAuth, (req, res) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "").toLowerCase();
    const progress = database.getProgress(userId, language || undefined);

    res.json({
      totalXp: progress.totalXp,
      todayXp: progress.todayXp,
      streak: progress.streak,
      hearts: progress.hearts,
      learnerLevel: progress.learnerLevel,
      lastCompletedDate: progress.lastCompletedDate,
      categories: progress.categories
    });
  });

  app.get("/api/stats", requireAuth, (req, res) => {
    const userId = req.authUserId;
    const language = String(req.query.language || "spanish").toLowerCase();
    const stats = database.getStats(userId, language);
    res.json(stats);
  });

  app.post("/api/session/complete", requireAuth, (req, res) => {
    const userId = req.authUserId;
    const {
      sessionId,
      language,
      category,
      attempts,
      hintsUsed,
      revealedAnswers
    } = req.body || {};

    if (!sessionId || !language || !category || !Array.isArray(attempts) || !attempts.length) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    if (attempts.length > 400) {
      return res.status(400).json({ error: "Too many attempts in payload" });
    }

    const session = database.getActiveSession(String(sessionId), userId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.completed) return res.status(409).json({ error: "Session already completed" });
    if (session.language !== language || session.category !== category) {
      return res.status(400).json({ error: "Session metadata mismatch" });
    }
    if (session.expiresAt < database.toIsoDate()) {
      return res.status(410).json({ error: "Session expired" });
    }

    const questionMap = new Map(session.questions.map((question) => [question.id, question]));
    let score = 0;
    let mistakes = 0;
    const evaluatedAttempts = [];

    for (const attempt of attempts) {
      const questionId = String(attempt?.questionId || "");
      const question = questionMap.get(questionId);
      if (!question) {
        return res.status(400).json({ error: `Unknown question in attempts: ${questionId}` });
      }

      const evaluation = evaluateAttempt(question, attempt);
      if (evaluation.correct) score += 1;
      else mistakes += 1;
      evaluatedAttempts.push({
        question,
        correct: evaluation.correct,
        errorType: evaluation.errorType
      });
    }

    const baseMaxScore = session.questions.length;
    const effectiveMaxScore = Math.max(baseMaxScore, score + mistakes);
    const safeHintsUsed = Number.isFinite(hintsUsed) ? Math.max(0, Math.floor(hintsUsed)) : 0;
    const safeRevealedAnswers = Number.isFinite(revealedAnswers)
      ? Math.max(0, Math.floor(revealedAnswers))
      : 0;
    const xp = calculateXp({
      score,
      maxScore: effectiveMaxScore,
      mistakes,
      hintsUsed: safeHintsUsed,
      revealedAnswers: safeRevealedAnswers,
      difficultyLevel: session.difficultyLevel
    });

    const today = database.toIsoDate();
    const saved = database.recordSession({
      userId,
      language,
      category,
      score,
      maxScore: effectiveMaxScore,
      mistakes,
      xpGained: xp.xpGained,
      difficultyLevel: session.difficultyLevel,
      today
    });

    evaluatedAttempts.forEach((entry) => {
      database.upsertItemProgressAttempt({
        userId,
        language,
        category,
        itemId: entry.question.id,
        objective: entry.question.objective || "",
        correct: entry.correct,
        errorType: entry.errorType,
        today
      });
      database.recordAttemptHistory({
        userId,
        sessionId,
        language,
        category,
        itemId: entry.question.id,
        objective: entry.question.objective || "",
        questionType: entry.question.type || "",
        correct: entry.correct,
        errorType: entry.errorType
      });
    });

    database.markActiveSessionCompleted(sessionId, userId);
    return res.json({
      ok: true,
      evaluated: {
        score,
        maxScore: effectiveMaxScore,
        mistakes,
        accuracy: Number((xp.accuracy * 100).toFixed(1))
      },
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

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(port, () => {
    console.log(`LingoFlow API listening on http://localhost:${port}`);
  });
}

module.exports = {
  createApp,
  normalizeSentence,
  evaluateAttempt,
  calculateXp
};
