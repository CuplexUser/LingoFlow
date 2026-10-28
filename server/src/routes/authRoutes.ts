const crypto = require("crypto");
const nodemailer = require("nodemailer");

// In-memory sliding-window rate limiter. Keyed by IP address.
const rateLimitStore = new Map<string, number[]>();

function makeRateLimiter(maxRequests: number, windowMs: number) {
  return (req: any, res: any, next: any) => {
    if (process.env.NODE_ENV === "test") return next();
    const key = String(req.ip || req.socket?.remoteAddress || "unknown");
    const now = Date.now();
    const timestamps = (rateLimitStore.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    timestamps.push(now);
    rateLimitStore.set(key, timestamps);
    next();
  };
}

const authRateLimit = makeRateLimiter(10, 60_000);       // 10 per minute
const sensitiveRateLimit = makeRateLimiter(5, 60_000);   // 5 per minute (login, register)

function emailFingerprint(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "none";
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

function buildAuthReturnUrl(publicAppUrl, params = {}) {
  const baseUrl = String(publicAppUrl || "").replace(/\/$/, "");
  const target = new URL(`${baseUrl}/login`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      target.searchParams.set(key, String(value));
    }
  });
  return target.toString();
}

function buildEmailVerificationLink(publicAppUrl, token) {
  const baseUrl = String(publicAppUrl || "").replace(/\/$/, "");
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetLink(publicAppUrl, token) {
  const baseUrl = String(publicAppUrl || "").replace(/\/$/, "");
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function normalizeInboundEmailToken(rawToken) {
  const trimmed = String(rawToken || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();

  // Some email clients surface quoted-printable encoded query values
  // (for example `token=3Dabc...` with soft-break `=` insertions).
  const likelyQuotedPrintableToken = /^3d[a-f0-9=]+$/i.test(lower);
  if (!likelyQuotedPrintableToken) {
    return trimmed;
  }

  const normalizedHex = lower
    .replace(/^3d/, "")
    .replace(/[^a-f0-9]/g, "");

  if (normalizedHex.length === 64) {
    return normalizedHex;
  }

  return trimmed;
}

function getEmailTransporter() {
  if (process.env.NODE_ENV === "test") {
    return null;
  }
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

// Resend (https://resend.com) is the preferred email provider -- a plain HTTPS API
// call, no SMTP transport needed. SMTP (via nodemailer/getEmailTransporter) remains as
// a fallback for deployments that configure SMTP_* instead of RESEND_API_KEY.
async function sendViaResend({ apiKey, emailFrom, toEmail, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: emailFrom, to: toEmail, subject, text, html })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error ${response.status}: ${body}`);
  }
}

async function deliverEmail({ emailFrom, toEmail, subject, text, html }) {
  if (process.env.NODE_ENV === "test") return false;

  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (resendApiKey) {
    await sendViaResend({ apiKey: resendApiKey, emailFrom, toEmail, subject, text, html });
    return true;
  }

  const transporter = getEmailTransporter();
  if (!transporter) return false;
  await transporter.sendMail({ from: emailFrom, to: toEmail, subject, text, html });
  return true;
}

async function sendVerificationEmail({ publicAppUrl, emailFrom, toEmail, displayName, token }) {
  const link = buildEmailVerificationLink(publicAppUrl, token);
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
  const html = `
      <p>Hi ${safeName},</p>
      <p>Welcome to LingoFlow. Confirm your email using the button below:</p>
      <p><a href="${link}" style="padding:10px 14px;border-radius:8px;background:#292524;color:#fff;text-decoration:none;">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
    `;

  const delivered = await deliverEmail({ emailFrom, toEmail, subject, text, html });
  if (!delivered) {
    console.log(`[EMAIL_DEV] Verify ${toEmail}: ${link}`);
  }
  return { delivered, link };
}

async function sendPasswordResetEmail({ publicAppUrl, emailFrom, toEmail, displayName, token }) {
  const link = buildPasswordResetLink(publicAppUrl, token);
  const subject = "Reset your LingoFlow password";
  const safeName = String(displayName || "Learner");
  const text = [
    `Hi ${safeName},`,
    "",
    "A password reset was requested for your LingoFlow account.",
    "If this was you, open the link below to choose a new password:",
    link,
    "",
    "This link expires in 1 hour."
  ].join("\n");
  const html = `
      <p>Hi ${safeName},</p>
      <p>A password reset was requested for your LingoFlow account.</p>
      <p><a href="${link}" style="padding:10px 14px;border-radius:8px;background:#292524;color:#fff;text-decoration:none;">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

  const delivered = await deliverEmail({ emailFrom, toEmail, subject, text, html });
  if (!delivered) {
    console.log(`[EMAIL_DEV] Reset ${toEmail}: ${link}`);
  }
  return { delivered, link };
}

// RevenueCat keeps a customer record per app user id (our user id). Deleting the account
// deletes that record too; it does not cancel a Google Play subscription, which the user
// cancels in Google Play. Best effort: the account is already gone when this runs.
async function deleteRevenueCatCustomer(userId, logger, requestId) {
  const secretKey = String(process.env.REVENUECAT_SECRET_API_KEY || "").trim();
  if (!secretKey) return;
  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(String(userId))}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${secretKey}` } }
    );
    if (!response.ok && response.status !== 404) {
      logger.warn("revenuecat_delete_failed", { requestId, userId, status: response.status });
    }
  } catch (error) {
    logger.warn("revenuecat_delete_failed", {
      requestId,
      userId,
      reason: error instanceof Error ? error.message : "unknown"
    });
  }
}

function registerAuthRoutes(app, deps) {
  const {
    database,
    logger,
    publicAppUrl,
    emailFrom,
    tokenService,
    hashPassword,
    verifyPassword,
    googleOauthClient,
    googleOauthClientId,
    googleIdTokenVerifier,
    isPremiumUser,
    requestClient
  } = deps;
  const contributionReviewerEmails = new Set(
    String(process.env.CONTRIBUTION_REVIEWER_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

  function canModerateCommunityExercises(user) {
    if (!user) return false;
    if (user.id === 1) return true;
    return contributionReviewerEmails.has(String(user.email || "").trim().toLowerCase());
  }

  // Feeds the admin sign-in stats. Best effort: a failed write never blocks the sign-in.
  async function recordLogin(req, userId, method) {
    try {
      await database.recordLogin({ userId, method, client: requestClient(req) });
    } catch (error) {
      logger.warn("login_record_failed", {
        requestId: req.requestId,
        userId,
        reason: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  function isGoogleOauthConfigured() {
    return Boolean(googleOauthClient && googleOauthClientId);
  }

  async function toClientUser(user) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      authProvider: user.authProvider,
      canModerateCommunityExercises: canModerateCommunityExercises(user),
      isPremium: await isPremiumUser(user.id)
    };
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

    return getGoogleProfileFromIdToken(idToken);
  }

  // Shared by the web redirect flow and native (Android Credential Manager) sign-in.
  // Native ID tokens are requested with the web client ID as serverClientId, so both
  // flows verify against the same audience.
  async function getGoogleProfileFromIdToken(idToken) {
    if (!googleIdTokenVerifier || !googleOauthClientId) {
      throw new Error("Google sign in is not configured");
    }
    const ticket = await googleIdTokenVerifier.verifyIdToken({
      idToken,
      audience: googleOauthClientId
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

  async function findOrCreateGoogleUser(profile) {
    let user = await database.getUserByEmail(profile.email);
    if (!user) {
      user = await database.createUser({
        email: profile.email,
        passwordHash: `oauth-google:${crypto.randomUUID()}`,
        displayName: profile.displayName,
        authProvider: "google",
        emailVerified: true
      });
    } else if (!user.emailVerified) {
      await database.markUserEmailVerified(user.id);
    }
    if (!user) {
      throw new Error("Could not create user");
    }

    await database.syncLearnerNameFromProfile(user.id, profile.displayName);
    return user;
  }

  app.post("/api/auth/register", sensitiveRateLimit, async (req, res) => {
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

    if (await database.getUserByEmail(email)) {
      logger.logAuthEvent("register_rejected", {
        requestId: req.requestId,
        reason: "email_exists",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(409).json({ error: "Email already registered" });
    }

    try {
      const created = await database.createUser({
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
      const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24)).toISOString();
      await database.replaceEmailVerification({
        userId: created.id,
        token: verifyToken,
        expiresAt
      });

      try {
        await sendVerificationEmail({
          publicAppUrl,
          emailFrom,
          toEmail: created.email,
          displayName: created.displayName,
          token: verifyToken
        });
      } catch (emailError) {
        logger.logAuthEvent("register_verification_email_failed", {
          requestId: req.requestId,
          userId: created.id,
          reason: emailError instanceof Error ? emailError.message : "unknown",
          emailFingerprint: emailFingerprint(email)
        });
      }

      logger.logAuthEvent("register_success", {
        requestId: req.requestId,
        userId: created.id,
        emailFingerprint: emailFingerprint(email)
      });

      return res.status(201).json({
        ok: true,
        requiresEmailVerification: true,
        message: "Registration successful. Please verify your email before signing in.",
        ...(process.env.NODE_ENV === "test" ? { verificationToken: verifyToken } : {})
      });
    } catch (error) {
      logger.logAuthEvent("register_failed", {
        requestId: req.requestId,
        reason: error instanceof Error ? error.message : "unknown",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(500).json({ error: "Could not register user" });
    }
  });

  app.post("/api/auth/login", sensitiveRateLimit, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await database.getUserByEmail(email);
    if (!user || user.authProvider !== "local" || !verifyPassword(password, user.passwordHash)) {
      logger.logAuthEvent("login_rejected", {
        requestId: req.requestId,
        reason: "invalid_credentials",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.emailVerified) {
      logger.logAuthEvent("login_rejected", {
        requestId: req.requestId,
        reason: "email_not_verified",
        emailFingerprint: emailFingerprint(email)
      });
      return res.status(403).json({ error: "Please verify your email before signing in" });
    }

    logger.logAuthEvent("login_success", {
      requestId: req.requestId,
      userId: user.id,
      emailFingerprint: emailFingerprint(email)
    });

    const token = tokenService.createAuthToken(user.id);
    await recordLogin(req, user.id, "password");
    await database.syncLearnerNameFromProfile(user.id, user.displayName);
    const freshUser = await database.getUserById(user.id);
    return res.json({
      token,
      user: await toClientUser(freshUser)
    });
  });

  app.post("/api/auth/resend-verification", authRateLimit, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const user = await database.getUserByEmail(email);
    if (!user || user.authProvider !== "local") {
      return res.json({ ok: true, message: "If your account exists, a verification email has been sent." });
    }
    if (user.emailVerified) {
      return res.json({ ok: true, message: "Your email is already verified. You can sign in." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24)).toISOString();
    await database.replaceEmailVerification({
      userId: user.id,
      token,
      expiresAt
    });
    try {
      await sendVerificationEmail({
        publicAppUrl,
        emailFrom,
        toEmail: email,
        displayName: user.displayName,
        token
      });
    } catch (emailError) {
      logger.logAuthEvent("resend_verification_email_failed", {
        requestId: req.requestId,
        userId: user.id,
        reason: emailError instanceof Error ? emailError.message : "unknown",
        emailFingerprint: emailFingerprint(email)
      });
    }

    return res.json({
      ok: true,
      message: "Verification email sent.",
      ...(process.env.NODE_ENV === "test" ? { verificationToken: token } : {})
    });
  });

  app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const user = await database.getUserByEmail(email);
    if (!user || user.authProvider !== "local") {
      return res.json({ ok: true, message: "If your account exists, a reset email has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (1000 * 60 * 60)).toISOString();
    await database.replacePasswordResetToken({
      userId: user.id,
      token,
      expiresAt
    });
    await sendPasswordResetEmail({
      publicAppUrl,
      emailFrom,
      toEmail: email,
      displayName: user.displayName,
      token
    });

    logger.logAuthEvent("forgot_password_success", {
      requestId: req.requestId,
      userId: user.id,
      emailFingerprint: emailFingerprint(email)
    });
    return res.json({
      ok: true,
      message: "If your account exists, a reset email has been sent.",
      ...(process.env.NODE_ENV === "test" ? { resetToken: token } : {})
    });
  });

  app.post("/api/auth/reset-password", authRateLimit, async (req, res) => {
    const token = normalizeInboundEmailToken(req.body?.token);
    const password = String(req.body?.password || "");
    if (!token || password.length < 8) {
      return res.status(400).json({ error: "Valid token and password are required" });
    }

    const user = await database.consumePasswordResetToken(token, hashPassword(password));
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    logger.logAuthEvent("reset_password_success", {
      requestId: req.requestId,
      userId: user.id
    });

    return res.json({ ok: true, message: "Password updated successfully. You can now sign in." });
  });

  app.get("/api/auth/google/start", async (req, res) => {
    if (!isGoogleOauthConfigured()) {
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authError: "Google sign in is not configured." }));
    }

    const state = tokenService.createGoogleOauthState();
    const url = googleOauthClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state
    });
    return res.redirect(url);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    if (!isGoogleOauthConfigured()) {
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authError: "Google sign in is not configured." }));
    }

    const code = String(req.query?.code || "");
    const state = String(req.query?.state || "");
    const oauthError = String(req.query?.error || "").trim();
    if (oauthError) {
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authError: "Google sign in was canceled or denied." }));
    }
    const parsedState = tokenService.parseGoogleOauthState(state);
    if (!parsedState) {
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authError: "Invalid Google sign in state." }));
    }

    try {
      const profile = await getGoogleProfileFromAuthorizationCode(code);
      const user = await findOrCreateGoogleUser(profile);
      const token = tokenService.createAuthToken(user.id);
      await recordLogin(req, user.id, "google");
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authToken: token }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authError: message || "Google authentication failed." }));
    }
  });

  // Native Google sign-in: the Android app obtains an ID token from Credential Manager
  // (Google blocks the redirect flow inside WebViews) and exchanges it for our token.
  app.post("/api/auth/google/native", sensitiveRateLimit, async (req, res) => {
    const idToken = String(req.body?.idToken || "").trim();
    if (!idToken) {
      return res.status(400).json({ error: "idToken is required" });
    }

    let profile;
    try {
      profile = await getGoogleProfileFromIdToken(idToken);
    } catch (error) {
      logger.logAuthEvent("google_native_rejected", {
        requestId: req.requestId,
        reason: error instanceof Error ? error.message : "unknown"
      });
      return res.status(401).json({ error: "Google sign in failed" });
    }

    try {
      const user = await findOrCreateGoogleUser(profile);
      logger.logAuthEvent("google_native_success", {
        requestId: req.requestId,
        userId: user.id,
        emailFingerprint: emailFingerprint(profile.email)
      });
      await recordLogin(req, user.id, "google");
      const freshUser = await database.getUserById(user.id);
      return res.json({
        token: tokenService.createAuthToken(user.id),
        user: await toClientUser(freshUser)
      });
    } catch (error) {
      logger.logAuthEvent("google_native_failed", {
        requestId: req.requestId,
        reason: error instanceof Error ? error.message : "unknown",
        emailFingerprint: emailFingerprint(profile.email)
      });
      return res.status(500).json({ error: "Could not sign in with Google" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.authUserId) return res.status(401).json({ error: "Authentication required" });
    const user = await database.getUserById(req.authUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user: await toClientUser(user) });
  });

  // Signed-in password change. Google accounts have no password here; they change it
  // at Google (or use "forgot password" to add one).
  app.post("/api/auth/change-password", sensitiveRateLimit, async (req, res) => {
    if (!req.authUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = await database.getUserById(req.authUserId);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (user.authProvider !== "local") {
      return res.status(400).json({ error: "This account signs in with Google and has no password to change" });
    }

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    // 400 rather than 401: the session is fine, only the typed password is wrong.
    const localUser = await database.getUserByEmail(user.email);
    if (!localUser || !currentPassword || !verifyPassword(currentPassword, localUser.passwordHash)) {
      logger.logAuthEvent("change_password_rejected", {
        requestId: req.requestId,
        userId: user.id,
        reason: "invalid_password"
      });
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    if (!await database.updateUserPassword(user.id, hashPassword(newPassword))) {
      return res.status(500).json({ error: "Could not change password" });
    }
    logger.logAuthEvent("change_password_success", {
      requestId: req.requestId,
      userId: user.id
    });
    return res.json({ ok: true, message: "Password changed." });
  });

  app.post("/api/auth/delete-account", async (req, res) => {
    if (!req.authUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await database.getUserById(req.authUserId);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const confirmDelete = Boolean(req.body?.confirmDelete);
    if (!confirmDelete) {
      return res.status(400).json({ error: "Deletion confirmation is required" });
    }

    // Password accounts confirm with their password. Google accounts have no password, so
    // they confirm by typing their account email; the bearer token already proves the
    // session. Play requires that every account created in the app can be deleted there.
    if (user.authProvider === "local") {
      const localUser = await database.getUserByEmail(user.email);
      const password = String(req.body?.password || "");
      if (!localUser || !password || !verifyPassword(password, localUser.passwordHash)) {
        logger.logAuthEvent("delete_account_rejected", {
          requestId: req.requestId,
          userId: user.id,
          reason: "invalid_password"
        });
        return res.status(401).json({ error: "Invalid password" });
      }
    } else {
      const confirmEmail = String(req.body?.confirmEmail || "").trim().toLowerCase();
      if (!confirmEmail || confirmEmail !== String(user.email).trim().toLowerCase()) {
        logger.logAuthEvent("delete_account_rejected", {
          requestId: req.requestId,
          userId: user.id,
          reason: "email_mismatch"
        });
        return res.status(400).json({ error: "Type your account email to confirm" });
      }
    }

    const deleted = await database.deleteUserById(user.id);
    if (!deleted) {
      logger.logAuthEvent("delete_account_failed", {
        requestId: req.requestId,
        userId: user.id,
        reason: "delete_failed"
      });
      return res.status(500).json({ error: "Could not delete account" });
    }

    await deleteRevenueCatCustomer(user.id, logger, req.requestId);
    logger.logAuthEvent("delete_account_success", {
      requestId: req.requestId,
      userId: user.id,
      authProvider: user.authProvider
    });
    return res.json({ ok: true, message: "Account deleted." });
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    const token = normalizeInboundEmailToken(req.body?.token);
    if (!token) return res.status(400).json({ error: "token is required" });
    const user = await database.consumeEmailVerificationToken(token);
    if (!user) {
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
}

module.exports = {
  registerAuthRoutes
};
