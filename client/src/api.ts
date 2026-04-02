import { AUTH_TOKEN_STORAGE_KEY } from "./constants";
import type {
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
  ProgressOverview,
  StatsData,
  CourseCategory
} from "./types/course";
import type { ContributionModerationStatus, ContributionSubmission } from "./types/contribution";
import type {
  ActiveSession,
  BuildSentenceQuestion,
  ClozeSentenceQuestion,
  FlashcardQuestion,
  MatchingQuestion,
  MultipleChoiceQuestion,
  PracticeListenQuestion,
  PracticeWordsQuestion,
  PronunciationQuestion,
  RoleplayQuestion,
  SessionAttempt,
  SessionQuestion
} from "./types/session";

type ApiRequestOptions = RequestInit & { headers?: HeadersInit };

type ApiErrorPayload = {
  error?: string;
};

export type AuthUser = {
  id: number;
  email: string;
  displayName: string;
  emailVerified?: boolean;
  authProvider?: string;
  canModerateCommunityExercises?: boolean;
};

export type AuthSuccessPayload = {
  token: string;
  user: AuthUser;
};

export type RegisterPayload = {
  displayName: string;
  email: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type VerifyEmailPayload = {
  token: string;
};

export type ResendVerificationPayload = {
  email: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  token: string;
  password: string;
};

export type CommunityExercisePayload = {
  language: string;
  category: string;
  prompt: string;
  correctAnswer: string;
  hints?: string[];
  difficulty?: string;
  audioUrl?: string;
  imageUrl?: string;
  culturalNote?: string;
  exerciseType?: string;
};

export type CommunityContributionListResponse = {
  ok?: boolean;
  canModerate: boolean;
  scope: "mine" | "all";
  submissions: ContributionSubmission[];
};

export type CommunityContributionUpdatePayload = {
  moderationStatus: ContributionModerationStatus;
};

export type SessionStartPayload = {
  language: string;
  category: string;
  count: number;
  mode?: string;
};

export type SessionCompletePayload = {
  sessionId: string;
  language: string;
  category: string;
  attempts: SessionAttempt[];
  hintsUsed: number;
  revealedAnswers: number;
};

export type MessageResponse = {
  ok?: boolean;
  message?: string;
};

export type CompleteSessionResponse = {
  evaluated: {
    score: number;
    maxScore: number;
    mistakes: number;
  };
  xpGained: number;
  streak?: number;
  learnerLevel?: number;
  mastery: number;
  levelUnlocked: string;
};

type RawSessionQuestion = Record<string, unknown>;
type RawActiveSession = Omit<ActiveSession, "questions"> & {
  questions?: unknown;
};

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

let authToken: string | null = null;

if (typeof window !== "undefined") {
  authToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setAuthToken(token: string | null | undefined): void {
  authToken = token || null;
  if (typeof window === "undefined") return;
  if (authToken) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

function getAuthToken(): string | null {
  return authToken;
}

function clearAuthToken(): void {
  setAuthToken(null);
}

function getGoogleOAuthStartUrl(): string {
  return `${API_BASE}/auth/google/start`;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asStringRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function mapSessionQuestion(rawQuestion: RawSessionQuestion): SessionQuestion {
  const base = {
    id: asString(rawQuestion.id),
    prompt: asString(rawQuestion.prompt),
    audioUrl: asOptionalString(rawQuestion.audioUrl),
    imageUrl: asOptionalString(rawQuestion.imageUrl),
    culturalNote: asOptionalString(rawQuestion.culturalNote),
    hints: asStringArray(rawQuestion.hints)
  };
  const type = asString(rawQuestion.type);

  if (type === "mc_sentence" || type === "dialogue_turn") {
    const question: MultipleChoiceQuestion = {
      ...base,
      type,
      answer: asString(rawQuestion.answer),
      options: asStringArray(rawQuestion.options)
    };
    return question;
  }
  if (type === "roleplay") {
    const question: RoleplayQuestion = {
      ...base,
      type,
      answer: asString(rawQuestion.answer),
      options: asStringArray(rawQuestion.options),
      answerEnglish: asOptionalString(rawQuestion.answerEnglish)
    };
    return question;
  }
  if (type === "practice_listen") {
    const question: PracticeListenQuestion = {
      ...base,
      type,
      answer: asString(rawQuestion.answer),
      options: asStringArray(rawQuestion.options)
    };
    return question;
  }
  if (type === "cloze_sentence") {
    const question: ClozeSentenceQuestion = {
      ...base,
      type,
      answer: asOptionalString(rawQuestion.answer),
      clozeAnswer: asString(rawQuestion.clozeAnswer),
      clozeText: asString(rawQuestion.clozeText),
      clozeOptions: asStringArray(rawQuestion.clozeOptions)
    };
    return question;
  }
  if (type === "build_sentence" || type === "dictation_sentence") {
    const question: BuildSentenceQuestion = {
      ...base,
      type,
      answer: asString(rawQuestion.answer),
      tokens: asStringArray(rawQuestion.tokens),
      acceptedAnswers: asStringArray(rawQuestion.acceptedAnswers)
    };
    return question;
  }
  if (type === "flashcard") {
    const question: FlashcardQuestion = {
      ...base,
      type,
      answer: asOptionalString(rawQuestion.answer),
      front: asOptionalString(rawQuestion.front),
      back: asOptionalString(rawQuestion.back)
    };
    return question;
  }
  if (type === "pronunciation" || type === "practice_speak") {
    const question: PronunciationQuestion = {
      ...base,
      type,
      answer: asString(rawQuestion.answer),
      acceptedAnswers: asStringArray(rawQuestion.acceptedAnswers)
    };
    return question;
  }
  if (type === "matching") {
    const question: MatchingQuestion = {
      ...base,
      type,
      pairs: asStringRecordArray(rawQuestion.pairs).map((pair) => ({
        prompt: asString(pair.prompt),
        answer: asString(pair.answer)
      }))
    };
    return question;
  }
  if (type === "practice_words") {
    const question: PracticeWordsQuestion = {
      ...base,
      type,
      pairs: asStringRecordArray(rawQuestion.pairs).map((pair) => ({
        left: asString(pair.left),
        right: asString(pair.right)
      }))
    };
    return question;
  }

  const fallback: MultipleChoiceQuestion = {
    ...base,
    type: "mc_sentence",
    answer: asString(rawQuestion.answer),
    options: asStringArray(rawQuestion.options)
  };
  return fallback;
}

export function normalizeActiveSession(rawSession: RawActiveSession): ActiveSession {
  return {
    sessionId: asString(rawSession.sessionId),
    language: asString(rawSession.language),
    category: asString(rawSession.category),
    categoryLabel: asString(rawSession.categoryLabel),
    recommendedLevel: asString(rawSession.recommendedLevel),
    practiceMode: rawSession.practiceMode,
    isDailyChallenge: Boolean(rawSession.isDailyChallenge),
    dailyChallengeDate: asOptionalString(rawSession.dailyChallengeDate),
    isMistakeReview: Boolean(rawSession.isMistakeReview),
    resumeState: rawSession.resumeState,
    questions: Array.isArray(rawSession.questions)
      ? rawSession.questions
          .filter((question): question is RawSessionQuestion => Boolean(question) && typeof question === "object")
          .map(mapSessionQuestion)
      : []
  };
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message =
      (payload as ApiErrorPayload | null)?.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getGoogleOAuthStartUrl,
  register: (payload: RegisterPayload) =>
    request<{ ok: boolean; requiresEmailVerification?: boolean; message?: string }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  login: (payload: LoginPayload) =>
    request<AuthSuccessPayload>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  resendVerification: (payload: ResendVerificationPayload) =>
    request<MessageResponse>(
      "/auth/resend-verification",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  forgotPassword: (payload: ForgotPasswordPayload) =>
    request<MessageResponse>(
      "/auth/forgot-password",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  resetPassword: (payload: ResetPasswordPayload) =>
    request<MessageResponse>(
      "/auth/reset-password",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  verifyEmail: (payload: VerifyEmailPayload) =>
    request<MessageResponse>(
      "/auth/verify-email",
      { method: "POST", body: JSON.stringify(payload) }
    ),
  getMe: () => request<{ user: AuthUser }>("/auth/me"),
  trackLoginPageVisit: () =>
    request<{ ok: boolean }>("/visitors/login", { method: "POST", body: JSON.stringify({}) }),
  getLanguages: () => request<LanguageOption[]>("/languages"),
  getCourse: (language: string) =>
    request<CourseCategory[]>(`/course?language=${encodeURIComponent(language)}`),
  startSession: (payload: SessionStartPayload) =>
    request<RawActiveSession>("/session/start", { method: "POST", body: JSON.stringify(payload) })
      .then(normalizeActiveSession),
  startDailyChallenge: (payload: { language: string }) =>
    request<RawActiveSession>("/session/daily", { method: "POST", body: JSON.stringify(payload) })
      .then(normalizeActiveSession),
  getSettings: () => request<LearnerSettings>("/settings"),
  saveSettings: (payload: LearnerSettings) =>
    request<LearnerSettings>("/settings", { method: "PUT", body: JSON.stringify(payload) }),
  getProgress: (language?: string) =>
    request<LearnerProgress>(`/progress${language ? `?language=${encodeURIComponent(language)}` : ""}`),
  getProgressOverview: () => request<ProgressOverview>("/progress-overview"),
  getStats: (language?: string) =>
    request<StatsData>(`/stats${language ? `?language=${encodeURIComponent(language)}` : ""}`),
  completeSession: (payload: SessionCompletePayload) =>
    request<CompleteSessionResponse>("/session/complete", { method: "POST", body: JSON.stringify(payload) }),
  getCommunityContributions: (params: {
    scope?: "mine" | "all";
    status?: ContributionModerationStatus | "";
    language?: string;
    category?: string;
    limit?: number;
  } = {}) => {
    const searchParams = new URLSearchParams();
    if (params.scope) searchParams.set("scope", params.scope);
    if (params.status) searchParams.set("status", params.status);
    if (params.language) searchParams.set("language", params.language);
    if (params.category) searchParams.set("category", params.category);
    if (params.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return request<CommunityContributionListResponse>(`/community/contributions${query ? `?${query}` : ""}`);
  },
  updateCommunityContributionStatus: (id: number, payload: CommunityContributionUpdatePayload) =>
    request<{ ok?: boolean; message?: string; submission?: ContributionSubmission }>(
      `/community/contributions/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) }
    ),
  contributeExercise: (payload: CommunityExercisePayload) =>
    request<MessageResponse>("/community/contribute", { method: "POST", body: JSON.stringify(payload) })
};
