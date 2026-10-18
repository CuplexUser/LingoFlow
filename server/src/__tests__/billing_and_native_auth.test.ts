import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

// Route modules read these when the app is built, so they must be set before index.ts loads.
const WEBHOOK_AUTH = "test-webhook-secret";
process.env.REVENUECAT_WEBHOOK_AUTH = WEBHOOK_AUTH;
process.env.REVENUECAT_SECRET_API_KEY = "sk_test_revenuecat";
process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "test-web-client-id";

test.before(async () => {
  await initTestDb();
});

const { createApp } = require("../index.ts");
const { OAuth2Client } = require("google-auth-library");

// ─── RevenueCat API stub ──────────────────────────────────────────────────────

const revenueCat = {
  subscribers: new Map<string, any>(),
  calls: 0,
  failNext: false
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (!url.startsWith("https://api.revenuecat.com/")) return realFetch(input, init);
  revenueCat.calls += 1;
  if (revenueCat.failNext) {
    revenueCat.failNext = false;
    return new Response("unavailable", { status: 503 });
  }
  const appUserId = decodeURIComponent(url.split("/subscribers/")[1] || "");
  const subscriber = revenueCat.subscribers.get(appUserId) || { entitlements: {}, subscriptions: {} };
  return new Response(JSON.stringify({ subscriber }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

function activeSubscriber({ expiresDate, unsubscribed = false }: { expiresDate: string; unsubscribed?: boolean }) {
  return {
    entitlements: {
      premium: {
        expires_date: expiresDate,
        grace_period_expires_date: null,
        product_identifier: "lingoflow_premium:yearly"
      }
    },
    subscriptions: {
      lingoflow_premium: {
        store: "play_store",
        expires_date: expiresDate,
        unsubscribe_detected_at: unsubscribed ? "2026-10-01T10:00:00Z" : null,
        billing_issues_detected_at: null
      }
    }
  };
}

// Second-precision, no milliseconds -- the format RevenueCat actually returns.
function rcDate(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ─── Google ID token stub ─────────────────────────────────────────────────────

const googleTokens = new Map<string, any>();
OAuth2Client.prototype.verifyIdToken = async function ({ idToken, audience }: any) {
  const payload = googleTokens.get(idToken);
  if (!payload || audience !== process.env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error("Invalid token");
  }
  return { getPayload: () => payload };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function startServer() {
  const app = await createApp();
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function signUp(base: string, label: string) {
  const email = `${label}-${Date.now()}@example.com`;
  const registered = await (await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!", displayName: label })
  })).json() as any;
  await fetch(`${base}/api/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: registered.verificationToken })
  });
  const logged = await (await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" })
  })).json() as any;
  return {
    userId: Number(logged.user.id),
    headers: { Authorization: `Bearer ${logged.token}`, "Content-Type": "application/json" }
  };
}

let eventCounter = 0;
async function sendWebhook(base: string, event: Record<string, unknown>, auth = WEBHOOK_AUTH) {
  const res = await fetch(`${base}/api/billing/revenuecat-webhook`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      api_version: "1.0",
      event: { id: `evt-${Date.now()}-${eventCounter += 1}`, type: "RENEWAL", ...event }
    })
  });
  return { status: res.status, body: await res.json() as any };
}

async function isPremium(base: string, headers: Record<string, string>): Promise<boolean> {
  const me = await (await fetch(`${base}/api/auth/me`, { headers })).json() as any;
  return me.user.isPremium;
}

// ─── RevenueCat webhook ───────────────────────────────────────────────────────

test("webhook rejects a missing or wrong authorization header", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  assert.equal((await sendWebhook(srv.base, { app_user_id: "1" }, "")).status, 401);
  assert.equal((await sendWebhook(srv.base, { app_user_id: "1" }, "wrong-secret")).status, 401);
});

test("webhook syncs the subscriber and ignores redelivered events", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "rc-webhook");
  revenueCat.subscribers.set(String(user.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));

  const eventId = `evt-initial-${user.userId}`;
  const first = await sendWebhook(srv.base, { id: eventId, type: "INITIAL_PURCHASE", app_user_id: String(user.userId) });
  assert.equal(first.status, 200);
  assert.equal(first.body.synced, 1);
  assert.equal(await isPremium(srv.base, user.headers), true);

  const callsBefore = revenueCat.calls;
  const again = await sendWebhook(srv.base, { id: eventId, type: "INITIAL_PURCHASE", app_user_id: String(user.userId) });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal(revenueCat.calls, callsBefore);
});

test("a failed sync is retried when RevenueCat redelivers the event", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "rc-retry");
  revenueCat.subscribers.set(String(user.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));

  const event = { id: `evt-retry-${user.userId}`, type: "RENEWAL", app_user_id: String(user.userId) };
  revenueCat.failNext = true;
  assert.equal((await sendWebhook(srv.base, event)).status, 500);
  assert.equal(await isPremium(srv.base, user.headers), false);

  const retried = await sendWebhook(srv.base, event);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.duplicate, undefined);
  assert.equal(await isPremium(srv.base, user.headers), true);
});

test("expiration removes access", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "rc-expire");
  revenueCat.subscribers.set(String(user.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));
  await sendWebhook(srv.base, { type: "INITIAL_PURCHASE", app_user_id: String(user.userId) });
  assert.equal(await isPremium(srv.base, user.headers), true);

  // Lapsed: RevenueCat still reports the entitlement, with an expiry in the past.
  revenueCat.subscribers.set(
    String(user.userId),
    activeSubscriber({ expiresDate: rcDate(-60_000), unsubscribed: true })
  );
  await sendWebhook(srv.base, { type: "EXPIRATION", app_user_id: String(user.userId) });
  assert.equal(await isPremium(srv.base, user.headers), false);

  // Refunded/revoked: the entitlement disappears entirely.
  revenueCat.subscribers.set(String(user.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));
  await sendWebhook(srv.base, { type: "UNCANCELLATION", app_user_id: String(user.userId) });
  assert.equal(await isPremium(srv.base, user.headers), true);
  revenueCat.subscribers.delete(String(user.userId));
  await sendWebhook(srv.base, { type: "CANCELLATION", app_user_id: String(user.userId) });
  assert.equal(await isPremium(srv.base, user.headers), false);
});

test("webhook skips anonymous and unknown app user ids", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const callsBefore = revenueCat.calls;
  const res = await sendWebhook(srv.base, {
    app_user_id: "$RCAnonymousID:abc123",
    aliases: ["$RCAnonymousID:abc123", "999999"]
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.synced, 0);
  assert.equal(revenueCat.calls, callsBefore);
});

test("TRANSFER re-syncs both the old and the new owner", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const from = await signUp(srv.base, "rc-from");
  const to = await signUp(srv.base, "rc-to");
  revenueCat.subscribers.set(String(from.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));
  await sendWebhook(srv.base, { type: "INITIAL_PURCHASE", app_user_id: String(from.userId) });
  assert.equal(await isPremium(srv.base, from.headers), true);

  revenueCat.subscribers.delete(String(from.userId));
  revenueCat.subscribers.set(String(to.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));
  const res = await sendWebhook(srv.base, {
    type: "TRANSFER",
    app_user_id: undefined,
    transferred_from: [String(from.userId)],
    transferred_to: [String(to.userId)]
  });
  assert.equal(res.body.synced, 2);
  assert.equal(await isPremium(srv.base, from.headers), false);
  assert.equal(await isPremium(srv.base, to.headers), true);
});

// ─── Client-triggered sync ────────────────────────────────────────────────────

test("billing sync requires auth and reports the current entitlement", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "rc-sync");

  const anonymous = await fetch(`${srv.base}/api/billing/sync`, { method: "POST" });
  assert.equal(anonymous.status, 401);

  let res = await fetch(`${srv.base}/api/billing/sync`, { method: "POST", headers: user.headers });
  assert.equal(res.status, 200);
  assert.equal((await res.json() as any).isPremium, false);

  revenueCat.subscribers.set(String(user.userId), activeSubscriber({ expiresDate: rcDate(86_400_000) }));
  res = await fetch(`${srv.base}/api/billing/sync`, { method: "POST", headers: user.headers });
  const body = await res.json() as any;
  assert.equal(body.isPremium, true);
  assert.equal(body.subscription.productId, "lingoflow_premium:yearly");
  assert.equal(body.subscription.store, "play_store");
  assert.equal(body.subscription.willRenew, true);

  revenueCat.failNext = true;
  res = await fetch(`${srv.base}/api/billing/sync`, { method: "POST", headers: user.headers });
  assert.equal(res.status, 502);
});

// ─── Native Google sign-in ────────────────────────────────────────────────────

test("native Google sign-in validates the ID token", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const post = (body: unknown) => fetch(`${srv.base}/api/auth/google/native`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  assert.equal((await post({})).status, 400);
  assert.equal((await post({ idToken: "not-a-known-token" })).status, 401);

  googleTokens.set("unverified-token", { email: "unverified@example.com", email_verified: false });
  assert.equal((await post({ idToken: "unverified-token" })).status, 401);
});

test("native Google sign-in creates the account once and returns a working token", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const email = `native-${Date.now()}@example.com`;
  googleTokens.set("valid-token", { email, email_verified: true, name: "Native Learner" });

  const res = await fetch(`${srv.base}/api/auth/google/native`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: "valid-token" })
  });
  assert.equal(res.status, 200);
  const first = await res.json() as any;
  assert.ok(first.token);
  assert.equal(first.user.email, email);
  assert.equal(first.user.authProvider, "google");
  assert.equal(first.user.isPremium, false);

  const me = await (await fetch(`${srv.base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${first.token}` }
  })).json() as any;
  assert.equal(me.user.id, first.user.id);

  const second = await (await fetch(`${srv.base}/api/auth/google/native`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: "valid-token" })
  })).json() as any;
  assert.equal(second.user.id, first.user.id);
});
