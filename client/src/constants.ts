export const PAGE_PATHS = {
  learn: "/learn",
  practice: "/practice",
  contribute: "/contribute",
  setup: "/setup",
  stats: "/stats"
} as const;

export const AUTH_PATHS = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  verifyEmail: "/verify-email"
} as const;

export const THEME_STORAGE_KEY = "lingoflow_theme_mode";
export const AUTH_TOKEN_STORAGE_KEY = "lingoflow_auth_token";

export const DEFAULT_DRAFT = {
  nativeLanguage: "english",
  targetLanguage: "spanish",
  dailyGoal: 30,
  dailyMinutes: 20,
  weeklyGoalSessions: 5,
  selfRatedLevel: "a1",
  learnerName: "Learner",
  learnerBio: "",
  focusArea: "",
  unlockAllLessons: false
} as const;

export type ThemeMode = "auto" | "light" | "dark";
