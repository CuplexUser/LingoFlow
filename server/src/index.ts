const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

type ErrorType =
  | "none"
  | "missing_answer"
  | "word_order"
  | "missing_word"
  | "grammar_or_vocab"
  | "dictation_mismatch"
  | "cloze_choice"
  | "wrong_option";

type QuestionType =
  | "mc_sentence"
  | "build_sentence"
  | "cloze_sentence"
  | "dictation_sentence"
  | "dialogue_turn"
  | "roleplay"
  | "flashcard"
  | "matching"
  | "pronunciation"
  | "practice_speak"
  | "practice_listen"
  | "practice_words";

interface SessionQuestion {
  id: string;
  type: QuestionType;
  answer: string;
  acceptedAnswers?: string[];
  clozeAnswer?: string;
  objective?: string;
}

interface SessionAttempt {
  questionId?: string;
  builtSentence?: string;
  textAnswer?: string;
  selectedOption?: string;
  matchingPairs?: Array<{ prompt: string; answer: string }>;
  practicePairs?: Array<{ left: string; right: string }>;
}

interface AttemptEvaluation {
  correct: boolean;
  errorType: ErrorType;
  submitted: string;
}

interface CalculateXpInput {
  score: number;
  maxScore: number;
  mistakes: number;
  hintsUsed: number;
  revealedAnswers: number;
  difficultyLevel: string;
}

interface AuthenticatedRequest {
  headers: Record<string, unknown>;
  body?: any;
  query?: any;
  path: string;
  method: string;
  requestId: string;
  authUserId: number | null;
  authFromToken: boolean;
}

const database = require("./db.ts");
const logger = require("./logger.ts");
const {
  LANGUAGES,
  CATEGORIES,
  LEVEL_ORDER,
  COURSE,
  getCourseOverview,
  getContentMetrics,
  generateSession,
  LEVEL_XP_MULTIPLIER
} = require("./data.ts");

const { registerCourseRoutes } = require("./routes/courseRoutes.ts");
const { registerSessionRoutes } = require("./routes/sessionRoutes.ts");
const { registerUserRoutes } = require("./routes/userRoutes.ts");
const { registerAuthRoutes } = require("./routes/authRoutes.ts");
const { createTokenService } = require("./auth/tokenService.ts");
const { hashPassword, verifyPassword } = require("./auth/password.ts");

const port = 4000;
const AUTH_SECRET = process.env.LINGOFLOW_AUTH_SECRET || "lingoflow-dev-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "http://localhost:5173";
const EMAIL_FROM = process.env.EMAIL_FROM || "LingoFlow <no-reply@lingoflow.local>";
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

const tokenService = createTokenService({
  authSecret: AUTH_SECRET,
  tokenTtlSeconds: TOKEN_TTL_SECONDS,
  googleStateTtlSeconds: GOOGLE_OAUTH_STATE_TTL_SECONDS
});

function normalizeSentence(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[.,!?;:¿¡]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function similarityRatio(left: string, right: string): number {
  const a = String(left || "");
  const b = String(right || "");
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - (levenshteinDistance(a, b) / maxLen);
}

function isAnswerMatch(question: SessionQuestion, submitted: string): boolean {
  const expectedVariants = [question.answer, ...(question.acceptedAnswers || [])]
    .map((value) => normalizeSentence(value))
    .filter(Boolean);
  const normalizedSubmitted = normalizeSentence(submitted);
  return expectedVariants.includes(normalizedSubmitted);
}

function isPronunciationMatch(question: SessionQuestion, submitted: string): boolean {
  if (isAnswerMatch(question, submitted)) return true;
  const normalizedExpected = normalizeSentence(question.answer);
  const normalizedSubmitted = normalizeSentence(submitted);
  if (!normalizedSubmitted) return false;
  return similarityRatio(normalizedExpected, normalizedSubmitted) >= 0.9;
}

function classifyError(question: SessionQuestion, submitted: string): ErrorType {
  if (question.type === "build_sentence" || question.type === "pronunciation" || question.type === "practice_speak") {
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

function evaluateAttempt(question: SessionQuestion, attempt: SessionAttempt): AttemptEvaluation {
  let submitted = "";
  if (question.type === "build_sentence") submitted = attempt?.builtSentence || "";
  if (question.type === "dictation_sentence") {
    submitted = attempt?.builtSentence || attempt?.textAnswer || "";
  }
  if (question.type === "pronunciation" || question.type === "practice_speak") {
    submitted = attempt?.textAnswer || attempt?.builtSentence || "";
    const correct = isPronunciationMatch(question, submitted);
    return {
      correct,
      errorType: correct ? "none" : classifyError(question, submitted),
      submitted
    };
  }
  if (
    question.type === "mc_sentence" ||
    question.type === "dialogue_turn" ||
    question.type === "roleplay" ||
    question.type === "practice_listen"
  ) {
    submitted = attempt?.selectedOption || "";
  }
  if (question.type === "flashcard") {
    submitted = attempt?.selectedOption || "";
    return {
      correct: submitted === "known",
      errorType: submitted === "known" ? "none" : "wrong_option",
      submitted
    };
  }
  if (question.type === "matching" || question.type === "practice_words") {
    const isPracticeWords = question.type === "practice_words";
    const submittedPairs = Array.isArray(
      isPracticeWords ? attempt?.practicePairs : attempt?.matchingPairs
    )
      ? (isPracticeWords ? attempt?.practicePairs : attempt?.matchingPairs)
      : [];
    const expectedPairs = Array.isArray(
      (question as SessionQuestion & { pairs?: Array<{ prompt?: string; answer?: string; left?: string; right?: string }> }).pairs
    )
      ? (question as SessionQuestion & { pairs?: Array<{ prompt?: string; answer?: string; left?: string; right?: string }> }).pairs
      : [];
    const correct = expectedPairs.length > 0 &&
      submittedPairs.length === expectedPairs.length &&
      expectedPairs.every((expected) => submittedPairs.some((pair) =>
        normalizeSentence(isPracticeWords ? pair.left : pair.prompt) === normalizeSentence(isPracticeWords ? expected.left : expected.prompt) &&
        normalizeSentence(isPracticeWords ? pair.right : pair.answer) === normalizeSentence(isPracticeWords ? expected.right : expected.answer)
      ));
    return {
      correct,
      errorType: correct ? "none" : "wrong_option",
      submitted: JSON.stringify(submittedPairs)
    };
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
}: CalculateXpInput): { accuracy: number; xpGained: number } {
  const accuracy = maxScore > 0 ? score / maxScore : 0;
  const baseXp = 16 + maxScore * 2;
  const levelMultiplier = LEVEL_XP_MULTIPLIER[difficultyLevel] || 1;
  const challengeBonus = accuracy >= 0.9 ? 8 : accuracy >= 0.75 ? 4 : 0;
  const penalty = (accuracy < 0.5 ? 6 : 0) + mistakes * 2 + hintsUsed + revealedAnswers * 3;
  const xpGained = Math.max(4, Math.round(baseXp * levelMultiplier + challengeBonus - penalty));
  return { accuracy, xpGained };
}

// Auth helpers live in auth/* and routes/authRoutes.ts.

function createApp(): any {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req: AuthenticatedRequest, res: any, next: any) => {
    const headerRequestId = String(req.headers["x-request-id"] || "").trim();
    req.requestId = headerRequestId || crypto.randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.use((req: AuthenticatedRequest, _res: any, next: any) => {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) {
      req.authUserId = null;
      req.authFromToken = false;
      return next();
    }
    const token = header.slice(7).trim();
    const payload = tokenService.parseAuthToken(token);
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

  function requireAuth(req: AuthenticatedRequest, res: any, next: any) {
    if (!req.authFromToken || !req.authUserId) {
      logger.logAuthEvent("auth_required_rejected", {
        requestId: req.requestId,
        path: req.path
      });
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = database.getUserById(req.authUserId);
    if (!user) {
      logger.logAuthEvent("auth_required_rejected", {
        requestId: req.requestId,
        path: req.path,
        reason: "user_not_found"
      });
      return res.status(401).json({ error: "Authentication required" });
    }
    return next();
  }

  const clientDistPath = path.join(__dirname, "..", "..", "client", "dist");

  // Non-auth learning APIs (course catalog, sessions, settings/progress).
  registerCourseRoutes(app, { requireAuth, database, LANGUAGES, CATEGORIES, LEVEL_ORDER, COURSE, getCourseOverview, getContentMetrics });
  registerSessionRoutes(app, {
    requireAuth,
    database,
    generateSession,
    getCourseOverview,
    evaluateAttempt,
    calculateXp,
    crypto
  });
  registerUserRoutes(app, { requireAuth, database });
  registerAuthRoutes(app, {
    database,
    logger,
    publicAppUrl: PUBLIC_APP_URL,
    emailFrom: EMAIL_FROM,
    tokenService,
    hashPassword,
    verifyPassword,
    googleOauthClient,
    googleOauthClientId: GOOGLE_OAUTH_CLIENT_ID
  });

  // Auth routes are registered in routes/authRoutes.ts.
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (req: AuthenticatedRequest, res: any, next: any) => {
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


