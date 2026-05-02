import { createContext, useContext } from "react";
import type { CourseCategory } from "../types/course";
import type { ActiveSession, PracticeMode, SessionReport, SessionSnapshot } from "../types/session";

export type MistakeReviewOffer = {
  language: string;
  session: ActiveSession;
};

export type SharePlatformId = "x" | "whatsapp" | "facebook" | "telegram";

export type SessionContextValue = {
  activeCourseLanguage: string;
  activeSession: ActiveSession | null;
  mistakeReviewOffer: MistakeReviewOffer | null;
  sessionShareLine: string;
  statusMessage: string;
  startCategory: (category: CourseCategory) => Promise<void>;
  startPractice: (mode: PracticeMode, category: CourseCategory) => Promise<void>;
  startDailyChallenge: () => Promise<void>;
  finishSession: (report: SessionReport) => Promise<void>;
  startMistakeReview: () => void;
  copySessionSummary: () => Promise<void>;
  shareToPlatform: (platform: SharePlatformId) => void;
  shareWithNative: () => Promise<void>;
  clearActiveSession: (language: string) => void;
  saveSessionSnapshot: (language: string, snapshot: SessionSnapshot) => void;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within AppProvider");
  return ctx;
}
