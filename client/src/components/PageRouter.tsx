import { BookmarksPage } from "./BookmarksPage";
import { ContributePage } from "./ContributePage";
import { LearnPage } from "./LearnPage";
import { PracticePage } from "./PracticePage";
import { SetupPage } from "./SetupPage";
import { StatsPage } from "./StatsPage";
import { AdminPage } from "./AdminPage";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "../context/NavigationContext";
import { useCourse } from "../context/CourseContext";
import { useSession } from "../context/SessionContext";
import type { LearnerSettings } from "../types/course";

export function PageRouter() {
  const { authUser, deleteAccount } = useAuth();
  const { activePage, navigateToPage } = useNavigation();
  const {
    languages,
    settings,
    draftSettings,
    progress,
    progressOverview,
    statsData,
    courseCategories,
    courseLanguages,
    bookmarks,
    bookmarksLoading,
    bookmarksError,
    activeLanguageLabel,
    setDraftSettings,
    saveSetup,
    removeBookmark,
    submitContribution,
    loadContributions,
    updateContributionStatus
  } = useCourse();
  const {
    activeCourseLanguage,
    activeSession,
    startCategory,
    startDailyChallenge,
    finishSession,
    clearActiveSession,
    saveSessionSnapshot,
    startPractice
  } = useSession();

  if (activePage === "learn") {
    return (
      <LearnPage
        settings={settings}
        progress={progress}
        courseCategories={courseCategories}
        activeSession={activeSession}
        onStartCategory={startCategory}
        onStartDailyChallenge={startDailyChallenge}
        onFinishSession={finishSession}
        onExitSession={() => {
          if (!activeCourseLanguage) return;
          clearActiveSession(activeCourseLanguage);
        }}
        onSessionSnapshot={(snapshot) => saveSessionSnapshot(activeCourseLanguage, snapshot)}
        onOpenSetup={() => navigateToPage("setup")}
        onOpenStats={() => navigateToPage("stats")}
      />
    );
  }

  if (activePage === "bookmarks") {
    return (
      <BookmarksPage
        bookmarks={bookmarks}
        loading={bookmarksLoading}
        errorMessage={bookmarksError}
        activeLanguageLabel={activeLanguageLabel}
        onRemoveBookmark={removeBookmark}
      />
    );
  }

  if (activePage === "practice") {
    return (
      <PracticePage
        courseCategories={courseCategories}
        activeSession={activeSession}
        onStartPractice={startPractice}
        onFinishSession={finishSession}
        onExitSession={() => {
          if (!activeCourseLanguage) return;
          clearActiveSession(activeCourseLanguage);
        }}
        onSessionSnapshot={(snapshot) => saveSessionSnapshot(activeCourseLanguage, snapshot)}
      />
    );
  }

  if (activePage === "contribute") {
    return (
      <ContributePage
        activeCourseLanguage={activeCourseLanguage}
        courseLanguages={courseLanguages}
        courseCategories={courseCategories}
        onSubmitContribution={submitContribution}
        onLoadContributions={loadContributions}
        onUpdateContributionStatus={updateContributionStatus}
      />
    );
  }

  if (activePage === "setup") {
    return (
      <SetupPage
        languages={languages}
        settings={settings}
        draftSettings={draftSettings}
        authProvider={authUser?.authProvider}
        onDraftChange={(patch: Partial<LearnerSettings>) =>
          setDraftSettings((prev) => ({ ...prev, ...patch }))
        }
        onSave={saveSetup}
        onReset={() => setDraftSettings(settings ? { ...settings } : draftSettings)}
        onDeleteAccount={deleteAccount}
      />
    );
  }

  if (activePage === "stats") {
    return (
      <StatsPage
        settings={settings}
        progress={progress}
        courseCategories={courseCategories}
        statsData={statsData}
        progressOverview={progressOverview}
        languages={languages}
        onNavigateToPractice={() => navigateToPage("practice")}
      />
    );
  }

  if (activePage === "admin") {
    return (
      <AdminPage
        canModerate={Boolean(authUser?.canModerateCommunityExercises)}
        activeCourseLanguage={activeCourseLanguage}
        courseCategories={courseCategories}
        onLoadContributions={loadContributions}
        onUpdateContributionStatus={updateContributionStatus}
      />
    );
  }

  return null;
}
