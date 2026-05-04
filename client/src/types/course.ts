export type LanguageOption = {
  id: string;
  label: string;
};

export type LearnerSettings = {
  nativeLanguage: string;
  targetLanguage: string;
  dailyGoal: number;
  dailyMinutes: number;
  weeklyGoalSessions: number;
  selfRatedLevel: string;
  learnerName: string;
  learnerBio: string;
  focusArea: string;
  unlockAllLessons?: boolean;
};

export type LearnerProgress = {
  learnerLevel: number;
  totalXp: number;
  todayXp: number;
  streak: number;
};

export type CourseCategory = {
  id: string;
  label: string;
  description: string;
  unlocked: boolean;
  lockReason?: string;
  recommended?: boolean;
  levels?: string[];
  levelUnlocked: string;
  totalPhrases?: number;
  mastery: number;
  accuracy: number;
  attempts: number;
  mediaRichCount?: number;
  sampleCulturalNotes?: string[];
};

export type StatsObjectiveEntry = {
  objective: string;
  accuracy: number;
};

export type ErrorTypeTrendEntry = {
  errorType: string;
  count: number;
};

export type StatsData = {
  categoryCount?: number;
  completionPercent?: number;
  accuracyPercent?: number;
  masteredCount?: number;
  streak?: number;
  sessionsLast7Days?: number;
  weeklyGoalSessions?: number;
  weeklyGoalProgress?: number;
  weakestCategories?: string[];
  objectiveStats?: StatsObjectiveEntry[];
  errorTypeTrend?: ErrorTypeTrendEntry[];
  recommendedCategories?: string[];
  categoryStats?: Array<{
    category: string;
    sessions: number;
    accuracy: number;
    lastCompletedAt?: string;
  }>;
  usageStats?: Array<{
    itemId: string;
    attempts: number;
    correctAttempts: number;
    completionRate: number;
    lastUsedAt?: string;
  }>;
  sessionsByDay?: Array<{ date: string; sessions: number }>;
  dailyXpHistory?: Array<{ date: string; xp: number }>;
  mistakeReviewCount?: number;
};

export type LanguageProgressOverview = {
  language: string;
  totalXp: number;
  streak: number;
};

export type ProgressOverview = {
  languages?: LanguageProgressOverview[];
};
