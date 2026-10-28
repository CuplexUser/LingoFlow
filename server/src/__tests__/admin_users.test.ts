import type { } from "node"; // ensure file is treated as a module

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureTestDb, initTestDb } = require("./helpers/testDb.ts");
configureTestDb(__filename);

test.before(async () => {
  await initTestDb();
});

const { createApp } = require("../index.ts");
const database = require("../db.ts");

const APP_HEADER = { "X-LingoFlow-Client": "android" };
const PASSWORD = "Password123!";

async function startServer() {
  const app = await createApp();
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function request(base: string, method: string, path: string, headers: Record<string, string>, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() as any };
}

async function login(base: string, email: string, password: string, headers: Record<string, string> = {}) {
  return request(base, "POST", "/api/auth/login", headers, { email, password });
}

async function signUp(base: string, label: string) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const registered = await request(base, "POST", "/api/auth/register", {}, {
    email,
    password: PASSWORD,
    displayName: label
  });
  await request(base, "POST", "/api/auth/verify-email", {}, { token: registered.body.verificationToken });
  const logged = await login(base, email, PASSWORD);
  return {
    email,
    userId: Number(logged.body.user.id),
    headers: { Authorization: `Bearer ${logged.body.token}` }
  };
}

// The reviewer list is read when the app is created, so it is set before starting.
async function startWithAdmin(t: any) {
  const adminEmail = `admin-${Date.now()}@example.com`;
  const previous = process.env.CONTRIBUTION_REVIEWER_EMAILS;
  process.env.CONTRIBUTION_REVIEWER_EMAILS = adminEmail;
  const srv = await startServer();
  t.after(() => {
    srv.close();
    if (previous === undefined) delete process.env.CONTRIBUTION_REVIEWER_EMAILS;
    else process.env.CONTRIBUTION_REVIEWER_EMAILS = previous;
  });
  const registered = await request(srv.base, "POST", "/api/auth/register", {}, {
    email: adminEmail,
    password: PASSWORD,
    displayName: "Admin"
  });
  await request(srv.base, "POST", "/api/auth/verify-email", {}, { token: registered.body.verificationToken });
  const logged = await login(srv.base, adminEmail, PASSWORD);
  return { srv, adminHeaders: { Authorization: `Bearer ${logged.body.token}` } };
}

test("a signed-in user can change their password", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "change-pw");

  const wrong = await request(srv.base, "POST", "/api/auth/change-password", user.headers, {
    currentPassword: "not-my-password",
    newPassword: "NewPassword456!"
  });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, "Current password is incorrect");

  const short = await request(srv.base, "POST", "/api/auth/change-password", user.headers, {
    currentPassword: PASSWORD,
    newPassword: "short"
  });
  assert.equal(short.status, 400);

  const anonymous = await request(srv.base, "POST", "/api/auth/change-password", {}, {
    currentPassword: PASSWORD,
    newPassword: "NewPassword456!"
  });
  assert.equal(anonymous.status, 401);

  const changed = await request(srv.base, "POST", "/api/auth/change-password", user.headers, {
    currentPassword: PASSWORD,
    newPassword: "NewPassword456!"
  });
  assert.equal(changed.status, 200);
  assert.equal((await login(srv.base, user.email, PASSWORD)).status, 401);
  assert.equal((await login(srv.base, user.email, "NewPassword456!")).status, 200);
});

test("changing the password voids an outstanding reset link", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "change-pw-reset");
  const forgot = await request(srv.base, "POST", "/api/auth/forgot-password", {}, { email: user.email });

  await request(srv.base, "POST", "/api/auth/change-password", user.headers, {
    currentPassword: PASSWORD,
    newPassword: "NewPassword456!"
  });
  const reset = await request(srv.base, "POST", "/api/auth/reset-password", {}, {
    token: forgot.body.resetToken,
    password: "Attacker789!"
  });
  assert.equal(reset.status, 400);
});

test("Google accounts cannot change a password they do not have", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "google-pw");
  const { db } = require("../db/driver.ts");
  await db.prepare("UPDATE users SET auth_provider = 'google' WHERE id = ?").run(user.userId);

  const res = await request(srv.base, "POST", "/api/auth/change-password", user.headers, {
    currentPassword: PASSWORD,
    newPassword: "NewPassword456!"
  });
  assert.equal(res.status, 400);
});

test("admin endpoints reject users who are not admins", async (t) => {
  const { srv } = await startWithAdmin(t);
  const user = await signUp(srv.base, "not-admin");

  assert.equal((await request(srv.base, "GET", "/api/admin/users", user.headers)).status, 403);
  assert.equal((await request(srv.base, "GET", "/api/admin/user-stats", user.headers)).status, 403);
  const grant = await request(srv.base, "PUT", `/api/admin/users/${user.userId}/premium`, user.headers, {});
  assert.equal(grant.status, 403);
  assert.equal((await request(srv.base, "GET", "/api/admin/users", {})).status, 401);
});

test("admins can list users with sign-in and activity details", async (t) => {
  const { srv, adminHeaders } = await startWithAdmin(t);
  const user = await signUp(srv.base, "listed");
  await login(srv.base, user.email, PASSWORD, APP_HEADER);
  await request(srv.base, "GET", "/api/settings", { ...user.headers, ...APP_HEADER });

  const list = await request(
    srv.base,
    "GET",
    `/api/admin/users?search=${encodeURIComponent(user.email.toUpperCase())}`,
    adminHeaders
  );
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 1);
  const [row] = list.body.users;
  assert.equal(row.id, user.userId);
  assert.equal(row.loginCount, 2);
  assert.equal(row.activeDays30, 1);
  assert.equal(row.lastActiveDay, database.toIsoDate());
  assert.match(row.createdAt, /Z$/);
  assert.equal(row.subscription, null);
  assert.equal(row.grant, null);

  const all = await request(srv.base, "GET", "/api/admin/users?limit=200", adminHeaders);
  assert.ok(all.body.users.every((entry: any) => entry.email !== "local@lingoflow.dev"));
});

test("user stats count registrations, active users and sign-ins", async (t) => {
  const { srv, adminHeaders } = await startWithAdmin(t);
  const user = await signUp(srv.base, "stats");
  await request(srv.base, "GET", "/api/settings", { ...user.headers, ...APP_HEADER });

  const stats = await request(srv.base, "GET", "/api/admin/user-stats?days=30", adminHeaders);
  assert.equal(stats.status, 200);
  assert.equal(stats.body.days, 30);
  assert.equal(stats.body.daily.length, 30);
  const today = stats.body.daily[stats.body.daily.length - 1];
  assert.equal(today.date, database.toIsoDate());
  assert.ok(today.signups >= 2);
  assert.ok(today.activeUsers >= 1);
  assert.ok(today.activeAndroid >= 1);
  assert.ok(today.logins >= 2);
  assert.equal(today.totalUsers, stats.body.totals.users);
  assert.ok(stats.body.active.today >= 1);
  assert.ok(stats.body.active.last30DaysAndroid >= 1);
  assert.equal(stats.body.trackingSince, database.toIsoDate());
});

test("an admin Premium grant lifts the app cap until revoked", async (t) => {
  const { srv, adminHeaders } = await startWithAdmin(t);
  const user = await signUp(srv.base, "granted");
  const appHeaders = { ...user.headers, ...APP_HEADER };

  let path = await request(srv.base, "GET", "/api/path?language=spanish", appHeaders);
  assert.equal(path.body.levelCap, "a1");

  const past = await request(srv.base, "PUT", `/api/admin/users/${user.userId}/premium`, adminHeaders, {
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  });
  assert.equal(past.status, 400);
  const missing = await request(srv.base, "PUT", "/api/admin/users/999999/premium", adminHeaders, {});
  assert.equal(missing.status, 404);

  const granted = await request(srv.base, "PUT", `/api/admin/users/${user.userId}/premium`, adminHeaders, {
    note: "Beta tester"
  });
  assert.equal(granted.status, 200);
  assert.equal(granted.body.grant.expiresAt, null);

  const me = await request(srv.base, "GET", "/api/auth/me", user.headers);
  assert.equal(me.body.user.isPremium, true);
  path = await request(srv.base, "GET", "/api/path?language=spanish", appHeaders);
  assert.equal(path.body.levelCap, null);
  // A restore with nothing in the store keeps the grant (RevenueCat isn't set up here).
  const sync = await request(srv.base, "POST", "/api/billing/sync", user.headers, {});
  assert.equal(sync.body.isPremium, true);

  const list = await request(srv.base, "GET", `/api/admin/users?search=${encodeURIComponent(user.email)}`, adminHeaders);
  assert.equal(list.body.users[0].grant.note, "Beta tester");

  const revoked = await request(srv.base, "DELETE", `/api/admin/users/${user.userId}/premium`, adminHeaders);
  assert.equal(revoked.body.revoked, true);
  path = await request(srv.base, "GET", "/api/path?language=spanish", appHeaders);
  assert.equal(path.body.levelCap, "a1");
});

test("an expired Premium grant no longer counts", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const user = await signUp(srv.base, "expired-grant");

  await database.grantPremium({ userId: user.userId, expiresAt: new Date(Date.now() - 60_000).toISOString() });
  let me = await request(srv.base, "GET", "/api/auth/me", user.headers);
  assert.equal(me.body.user.isPremium, false);

  await database.grantPremium({ userId: user.userId, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  me = await request(srv.base, "GET", "/api/auth/me", user.headers);
  assert.equal(me.body.user.isPremium, true);
});

test("deleting a user removes their grant and keeps grants they gave", async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());
  const giver = await signUp(srv.base, "giver");
  const receiver = await signUp(srv.base, "receiver");
  await database.grantPremium({ userId: receiver.userId, grantedBy: giver.userId });
  await database.grantPremium({ userId: giver.userId, grantedBy: receiver.userId });

  assert.equal(await database.deleteUserById(giver.userId), true);
  assert.equal(await database.getActivePremiumGrant(giver.userId), null);
  assert.ok(await database.getActivePremiumGrant(receiver.userId));
});
