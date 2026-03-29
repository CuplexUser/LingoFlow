import { useState } from "react";
import { api } from "../api";
import { DEFAULT_DRAFT } from "../constants";
import type {
  CourseCategory,
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
  ProgressOverview,
  StatsData
} from "../types/course";

type UseAuthenticatedAppDataParams = {
  activeCourseLanguage: string;
  setActiveCourseLanguage: (language: string) => void;
};

export function useAuthenticatedAppData({
  activeCourseLanguage,
  setActiveCourseLanguage
}: UseAuthenticatedAppDataParams) {
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [settings, setSettings] = useState<LearnerSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<LearnerSettings>(DEFAULT_DRAFT);
  const [progress, setProgress] = useState<LearnerProgress | null>(null);
  const [progressOverview, setProgressOverview] = useState<ProgressOverview | null>(null);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [courseCategories, setCourseCategories] = useState<CourseCategory[]>([]);

  async function refreshCourseAndProgress(targetLanguage: string) {
    const [course, nextProgress, stats, overview] = await Promise.all([
      api.getCourse(targetLanguage),
      api.getProgress(targetLanguage),
      api.getStats(targetLanguage),
      api.getProgressOverview()
    ]);
    setCourseCategories(course);
    setProgress(nextProgress);
    setStatsData(stats);
    setProgressOverview(overview);
  }

  async function hydrateAuthenticatedApp() {
    const [langs, conf] = await Promise.all([api.getLanguages(), api.getSettings()]);
    setLanguages(langs);
    setSettings(conf);
    setDraftSettings({ ...DEFAULT_DRAFT, ...conf });
    const availableLanguageIds = new Set(
      langs
        .map((item) => item.id)
        .filter((id) => id !== conf.nativeLanguage)
    );
    const preferredLanguage = String(activeCourseLanguage || "").toLowerCase();
    const targetLanguage = String(conf.targetLanguage || "spanish").toLowerCase();
    const fallbackLanguage = langs.find((item) => item.id !== conf.nativeLanguage)?.id || targetLanguage;
    const initialCourseLanguage = availableLanguageIds.has(preferredLanguage)
      ? preferredLanguage
      : (availableLanguageIds.has(targetLanguage) ? targetLanguage : fallbackLanguage);
    setActiveCourseLanguage(initialCourseLanguage);
    await refreshCourseAndProgress(initialCourseLanguage);
  }

  function resetAuthenticatedAppData() {
    setLanguages([]);
    setSettings(null);
    setDraftSettings(DEFAULT_DRAFT);
    setProgress(null);
    setProgressOverview(null);
    setStatsData(null);
    setCourseCategories([]);
  }

  return {
    languages,
    settings,
    draftSettings,
    progress,
    progressOverview,
    statsData,
    courseCategories,
    setSettings,
    setDraftSettings,
    hydrateAuthenticatedApp,
    refreshCourseAndProgress,
    resetAuthenticatedAppData
  };
}
