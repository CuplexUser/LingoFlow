import { createContext, useContext } from "react";
import type { Bookmark, CommunityExercisePayload, CommunityContributionUpdatePayload, CommunityContributionListResponse } from "../api";
import type {
  CourseCategory,
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
  ProgressOverview,
  StatsData
} from "../types/course";
import type React from "react";

export type CourseContextValue = {
  languages: LanguageOption[];
  courseLanguages: LanguageOption[];
  settings: LearnerSettings | null;
  draftSettings: LearnerSettings;
  progress: LearnerProgress | null;
  progressOverview: ProgressOverview | null;
  statsData: StatsData | null;
  courseCategories: CourseCategory[];
  bookmarks: Bookmark[];
  bookmarksLoading: boolean;
  bookmarksError: string;
  pendingContributionCount: number;
  activeLanguageLabel: string;
  setDraftSettings: React.Dispatch<React.SetStateAction<LearnerSettings>>;
  switchCourseLanguage: (lang: string) => Promise<void>;
  saveSetup: () => Promise<void>;
  submitContribution: (payload: CommunityExercisePayload) => Promise<{ message?: string }>;
  loadContributions: (params: {
    scope?: "mine" | "all";
    status?: "pending" | "approved" | "rejected" | "changes_requested" | "";
    language?: string;
    category?: string;
    limit?: number;
  }) => Promise<CommunityContributionListResponse>;
  updateContributionStatus: (id: number, payload: CommunityContributionUpdatePayload) => Promise<{ ok?: boolean; message?: string }>;
  removeBookmark: (questionId: string) => Promise<void>;
};

export const CourseContext = createContext<CourseContextValue | null>(null);

export function useCourse(): CourseContextValue {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used within AppProvider");
  return ctx;
}
