import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { api, type AuthUser, type Bookmark } from "../api";
import { useAuthenticatedAppData } from "../hooks/useAuthenticatedAppData";
import type {
  CourseCategory,
  LanguageOption,
  LearnerProgress,
  LearnerSettings,
  ProgressOverview,
  StatsData,
} from "../types/course";

export type CourseContextValue = {
  languages: LanguageOption[];
  settings: LearnerSettings | null;
  draftSettings: LearnerSettings;
  progress: LearnerProgress | null;
  progressOverview: ProgressOverview | null;
  statsData: StatsData | null;
  courseCategories: CourseCategory[];
  activeCourseLanguage: string;
  courseLanguages: LanguageOption[];
  bookmarks: Bookmark[];
  bookmarksLoading: boolean;
  bookmarksError: string;
  setSettings: Dispatch<SetStateAction<LearnerSettings | null>>;
  setDraftSettings: Dispatch<SetStateAction<LearnerSettings>>;
  setBookmarks: Dispatch<SetStateAction<Bookmark[]>>;
  setBookmarksLoading: Dispatch<SetStateAction<boolean>>;
  setBookmarksError: Dispatch<SetStateAction<string>>;
  switchCourseLanguage: (nextLanguage: string) => Promise<void>;
  refreshCourseAndProgress: (targetLanguage: string) => Promise<void>;
  hydrateAuthenticatedApp: () => Promise<void>;
  resetAuthenticatedAppData: () => void;
  setActiveCourseLanguage: (language: string) => void;
};

const CourseContext = createContext<CourseContextValue | null>(null);

export function useCourse(): CourseContextValue {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used within CourseProvider");
  return ctx;
}

type CourseProviderProps = {
  children: ReactNode;
  activeCourseLanguage: string;
  setActiveCourseLanguage: (language: string) => void;
  authUser: AuthUser | null;
  activePage: string;
  setStatusMessage: (msg: string) => void;
};

export function CourseProvider({
  children,
  activeCourseLanguage,
  setActiveCourseLanguage,
  authUser,
  activePage,
  setStatusMessage,
}: CourseProviderProps) {
  const {
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
    resetAuthenticatedAppData,
  } = useAuthenticatedAppData({ activeCourseLanguage, setActiveCourseLanguage });

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState("");

  const courseLanguages = useMemo(
    () => languages.filter((language) => language.id !== settings?.nativeLanguage),
    [languages, settings?.nativeLanguage]
  );

  // Load bookmarks
  useEffect(() => {
    if (!authUser || !activeCourseLanguage) return;
    let cancelled = false;

    async function loadBookmarks() {
      const showLoading = activePage === "bookmarks";
      if (showLoading) {
        setBookmarksLoading(true);
      }
      setBookmarksError("");
      try {
        const data = await api.getBookmarks(activeCourseLanguage);
        if (cancelled) return;
        setBookmarks(data);
      } catch (_error) {
        if (cancelled) return;
        setBookmarks([]);
        setBookmarksError("Could not load bookmarks right now.");
      } finally {
        setBookmarksLoading(false);
      }
    }

    loadBookmarks();

    return () => {
      cancelled = true;
    };
  }, [authUser, activeCourseLanguage, activePage]);

  async function switchCourseLanguage(nextLanguage: string) {
    const safeLanguage = String(nextLanguage || "")
      .trim()
      .toLowerCase();
    if (safeLanguage && safeLanguage === settings?.nativeLanguage) return;
    if (!safeLanguage || safeLanguage === activeCourseLanguage) return;
    try {
      setActiveCourseLanguage(safeLanguage);
      await refreshCourseAndProgress(safeLanguage);
      setStatusMessage("");
    } catch (_error) {
      setStatusMessage("Could not switch course language right now.");
    }
  }

  return (
    <CourseContext.Provider
      value={{
        languages,
        settings,
        draftSettings,
        progress,
        progressOverview,
        statsData,
        courseCategories,
        activeCourseLanguage,
        courseLanguages,
        bookmarks,
        bookmarksLoading,
        bookmarksError,
        setSettings,
        setDraftSettings,
        setBookmarks,
        setBookmarksLoading,
        setBookmarksError,
        switchCourseLanguage,
        refreshCourseAndProgress,
        hydrateAuthenticatedApp,
        resetAuthenticatedAppData,
        setActiveCourseLanguage,
      }}
    >
      {children}
    </CourseContext.Provider>
  );
}
