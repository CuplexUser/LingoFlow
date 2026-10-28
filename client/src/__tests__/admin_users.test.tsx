import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const changePassword = vi.fn();
const getAdminUsers = vi.fn();
const getAdminUserStats = vi.fn();
const grantPremium = vi.fn();
const revokePremium = vi.fn();

vi.mock("../api", () => ({
  api: {
    changePassword: (...args: unknown[]) => changePassword(...args),
    getAdminUsers: (...args: unknown[]) => getAdminUsers(...args),
    getAdminUserStats: (...args: unknown[]) => getAdminUserStats(...args),
    grantPremium: (...args: unknown[]) => grantPremium(...args),
    revokePremium: (...args: unknown[]) => revokePremium(...args)
  }
}));

import { SetupPage } from "../components/SetupPage";
import { AdminUsersPanel } from "../components/AdminUsersPanel";
import type { LearnerSettings } from "../types/course";

const SETTINGS = {
  nativeLanguage: "english",
  targetLanguage: "spanish",
  dailyGoal: 30,
  dailyMinutes: 20,
  weeklyGoalSessions: 5,
  selfRatedLevel: "a1",
  learnerName: "Ada",
  learnerBio: "",
  focusArea: "",
  unlockAllLessons: false,
  speechRate: 0.92
} as LearnerSettings;

function renderSetup(authProvider: string) {
  return render(
    <SetupPage
      languages={[]}
      settings={SETTINGS}
      draftSettings={SETTINGS}
      authProvider={authProvider}
      accountEmail="ada@example.com"
      onDraftChange={() => {}}
      onSave={() => {}}
      onReset={() => {}}
      onDeleteAccount={async () => {}}
    />
  );
}

function day(offset: number) {
  const date = new Date(Date.UTC(2026, 9, 1 + offset));
  return date.toISOString().slice(0, 10);
}

const STATS = {
  days: 30,
  trackingSince: day(20),
  totals: {
    users: 12,
    verified: 10,
    google: 4,
    newLast7Days: 2,
    newLast30Days: 5,
    premiumSubscriptions: 1,
    premiumGrants: 2
  },
  active: { today: 3, last7Days: 6, last30Days: 8, last30DaysWeb: 5, last30DaysAndroid: 4 },
  logins: { last7Days: 7, last30Days: 19, usersLast30Days: 9 },
  daily: Array.from({ length: 30 }, (_, index) => ({
    date: day(index),
    signups: index % 6 === 0 ? 1 : 0,
    totalUsers: 7 + Math.floor(index / 6),
    activeUsers: index >= 20 ? 2 : 0,
    activeWeb: index >= 20 ? 1 : 0,
    activeAndroid: index >= 20 ? 1 : 0,
    logins: index >= 20 ? 1 : 0
  }))
};

const FREE_USER = {
  id: 7,
  email: "free@example.com",
  displayName: "Free Learner",
  authProvider: "local",
  emailVerified: true,
  createdAt: "2026-10-02T10:00:00.000Z",
  lastLoginAt: "2026-10-27T10:00:00.000Z",
  loginCount: 3,
  lastActiveDay: "2026-10-27",
  activeDays30: 4,
  totalXp: 1200,
  subscription: null,
  grant: null,
  onPremiumAccountList: false
};

const GRANTED_USER = {
  ...FREE_USER,
  id: 8,
  email: "granted@example.com",
  displayName: "Granted Learner",
  grant: { expiresAt: null, note: "Beta tester", createdAt: "2026-10-20T10:00:00.000Z" }
};

describe("change password", () => {
  beforeEach(() => {
    changePassword.mockReset();
  });

  it("submits once the new passwords match", async () => {
    changePassword.mockResolvedValue({ ok: true });
    renderSetup("local");
    const submit = screen.getByRole("button", { name: "Change Password" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "OldPassword1" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword2" } });
    expect(screen.getByText("The new passwords do not match.")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword1" } });
    fireEvent.click(submit);

    await screen.findByText("Password changed.");
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "OldPassword1", newPassword: "NewPassword1" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("shows the server's error", async () => {
    changePassword.mockRejectedValue(new Error("Current password is incorrect"));
    renderSetup("local");
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword1" } });
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
  });

  it("explains that Google accounts have no password here", () => {
    renderSetup("google");
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.getByText(/You sign in with Google/)).toBeInTheDocument();
  });
});

describe("AdminUsersPanel", () => {
  beforeEach(() => {
    getAdminUsers.mockReset();
    getAdminUserStats.mockReset();
    grantPremium.mockReset();
    revokePremium.mockReset();
    getAdminUserStats.mockResolvedValue(STATS);
    getAdminUsers.mockResolvedValue({ total: 2, users: [FREE_USER, GRANTED_USER] });
    grantPremium.mockResolvedValue({ ok: true });
    revokePremium.mockResolvedValue({ ok: true, revoked: true });
  });

  it("shows growth and activity stats and the user list", async () => {
    render(<AdminUsersPanel />);
    expect(await screen.findByRole("heading", { name: "Registered users" })).toBeInTheDocument();
    expect(screen.getByText("Daily active users")).toBeInTheDocument();
    expect(screen.getByText(/1 subscribed · 2 granted/)).toBeInTheDocument();
    expect(screen.getByText(/Activity and sign-ins are recorded from/)).toBeInTheDocument();
    expect(await screen.findByText("free@example.com")).toBeInTheDocument();
    expect(screen.getByText(/Granted · no end date/)).toBeInTheDocument();
    expect(getAdminUserStats).toHaveBeenCalledWith(90);
  });

  it("reloads stats for another range", async () => {
    render(<AdminUsersPanel />);
    await screen.findByRole("heading", { name: "Registered users" });
    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    await waitFor(() => expect(getAdminUserStats).toHaveBeenLastCalledWith(30));
  });

  it("grants Premium with an optional end date and note", async () => {
    render(<AdminUsersPanel />);
    const row = (await screen.findByText("free@example.com")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Grant Premium" }));
    fireEvent.change(within(row).getByLabelText("Note"), { target: { value: "Support case" } });
    fireEvent.click(within(row).getByRole("button", { name: "Grant Premium" }));

    await waitFor(() => expect(grantPremium).toHaveBeenCalledWith(7, { expiresAt: null, note: "Support case" }));
    await waitFor(() => expect(getAdminUsers).toHaveBeenCalledTimes(2));
  });

  it("asks for confirmation before revoking a grant", async () => {
    render(<AdminUsersPanel />);
    const row = (await screen.findByText("granted@example.com")).closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Revoke" }));
    expect(revokePremium).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(revokePremium).toHaveBeenCalledWith(8));
  });
});
