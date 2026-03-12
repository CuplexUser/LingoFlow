const crypto = require("crypto");
const nodemailer = require("nodemailer");

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

async function sendVerificationEmail({ publicAppUrl, emailFrom, toEmail, displayName, token }) {
  const link = buildEmailVerificationLink(publicAppUrl, token);
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
    from: emailFrom,
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

async function sendPasswordResetEmail({ publicAppUrl, emailFrom, toEmail, displayName, token }) {
  const link = buildPasswordResetLink(publicAppUrl, token);
  const transporter = getEmailTransporter();
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

  if (!transporter) {
    console.log(`[EMAIL_DEV] Reset ${toEmail}: ${link}`);
    return { delivered: false, link };
  }

  await transporter.sendMail({
    from: emailFrom,
    to: toEmail,
    subject,
    text,
    html: `
      <p>Hi ${safeName},</p>
      <p>A password reset was requested for your LingoFlow account.</p>
      <p><a href="${link}" style="padding:10px 14px;border-radius:8px;background:#292524;color:#fff;text-decoration:none;">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `
  });
  return { delivered: true, link };
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
    googleOauthClientId
  } = deps;

  function isGoogleOauthConfigured() {
    return Boolean(googleOauthClient && googleOauthClientId);
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
      const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24)).toISOString();
      database.replaceEmailVerification({
        userId: created.id,
        token: verifyToken,
        expiresAt
      });

      await sendVerificationEmail({
        publicAppUrl,
        emailFrom,
        toEmail: created.email,
        displayName: created.displayName,
        token: verifyToken
      });

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

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = database.getUserByEmail(email);
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
    database.syncLearnerNameFromProfile(user.id, user.displayName);
    return res.json({
      token,
      user: database.getUserById(user.id)
    });
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const user = database.getUserByEmail(email);
    if (!user || user.authProvider !== "local") {
      return res.json({ ok: true, message: "If your account exists, a verification email has been sent." });
    }
    if (user.emailVerified) {
      return res.json({ ok: true, message: "Your email is already verified. You can sign in." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 24)).toISOString();
    database.replaceEmailVerification({
      userId: user.id,
      token,
      expiresAt
    });
    await sendVerificationEmail({
      publicAppUrl,
      emailFrom,
      toEmail: email,
      displayName: user.displayName,
      token
    });

    return res.json({
      ok: true,
      message: "Verification email sent.",
      ...(process.env.NODE_ENV === "test" ? { verificationToken: token } : {})
    });
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const user = database.getUserByEmail(email);
    if (!user || user.authProvider !== "local") {
      return res.json({ ok: true, message: "If your account exists, a reset email has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (1000 * 60 * 60)).toISOString();
    database.replacePasswordResetToken({
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

  app.post("/api/auth/reset-password", (req, res) => {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token || password.length < 8) {
      return res.status(400).json({ error: "Valid token and password are required" });
    }

    const user = database.consumePasswordResetToken(token, hashPassword(password));
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    logger.logAuthEvent("reset_password_success", {
      requestId: req.requestId,
      userId: user.id
    });

    return res.json({ ok: true, message: "Password updated successfully. You can now sign in." });
  });

  app.get("/api/auth/google/start", (req, res) => {
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
      let user = database.getUserByEmail(profile.email);
      if (!user) {
        user = database.createUser({
          email: profile.email,
          passwordHash: `oauth-google:${crypto.randomUUID()}`,
          displayName: profile.displayName,
          authProvider: "google",
          emailVerified: true
        });
      } else if (!user.emailVerified) {
        database.markUserEmailVerified(user.id);
      }
      if (!user) {
        throw new Error("Could not create user");
      }

      database.syncLearnerNameFromProfile(user.id, profile.displayName);
      const token = tokenService.createAuthToken(user.id);
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authToken: token }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      return res.redirect(buildAuthReturnUrl(publicAppUrl, { authError: message || "Google authentication failed." }));
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.authUserId) return res.status(401).json({ error: "Authentication required" });
    const user = database.getUserById(req.authUserId);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        authProvider: user.authProvider
      }
    });
  });

  app.post("/api/auth/verify-email", (req, res) => {
    const token = String(req.body?.token || "");
    if (!token) return res.status(400).json({ error: "token is required" });
    const user = database.consumeEmailVerificationToken(token);
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
