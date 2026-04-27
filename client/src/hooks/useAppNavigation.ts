import { useEffect, useState } from "react";
import { AUTH_PATHS, PAGE_PATHS } from "../constants";
import { getPageFromPathname } from "../utils/theme";

export type AuthMode = "login" | "register" | "forgotPassword" | "resetPassword";
export type AppPage = "bookmarks" | "learn" | "practice" | "contribute" | "setup" | "stats" | "admin";

export function getAuthModeFromPathname(pathname: string): AuthMode {
  if (pathname === AUTH_PATHS.register) return "register";
  if (pathname === AUTH_PATHS.forgotPassword) return "forgotPassword";
  if (pathname === AUTH_PATHS.resetPassword) return "resetPassword";
  return "login";
}

type UseAppNavigationParams = {
  authenticated: boolean;
};

export function useAppNavigation({ authenticated }: UseAppNavigationParams) {
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    if (typeof window === "undefined") return "login";
    return getAuthModeFromPathname(window.location.pathname);
  });
  const [activePage, setActivePage] = useState<AppPage>(() => {
    if (typeof window === "undefined") return "learn";
    return getPageFromPathname(window.location.pathname);
  });

  useEffect(() => {
    function onPopState() {
      if (!authenticated) {
        setAuthMode(getAuthModeFromPathname(window.location.pathname));
        return;
      }
      setActivePage(getPageFromPathname(window.location.pathname));
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authenticated]);

  useEffect(() => {
    const knownPaths = authenticated
      ? Object.values(PAGE_PATHS)
      : Object.values(AUTH_PATHS);
    if (!knownPaths.some((path) => path === window.location.pathname)) {
      window.history.replaceState({}, "", authenticated ? PAGE_PATHS.learn : AUTH_PATHS.login);
      if (authenticated) {
        setActivePage("learn");
      } else {
        setAuthMode("login");
      }
    }
  }, [authenticated]);

  function navigateToPage(nextPage: AppPage) {
    const pagePathMap: Record<AppPage, string> = {
      learn: PAGE_PATHS.learn,
      practice: PAGE_PATHS.practice,
      contribute: PAGE_PATHS.contribute,
      setup: PAGE_PATHS.setup,
      stats: PAGE_PATHS.stats,
      bookmarks: PAGE_PATHS.bookmarks,
      admin: PAGE_PATHS.admin
    };
    const path = pagePathMap[nextPage] || PAGE_PATHS.learn;
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setActivePage(nextPage);
  }

  function navigateAuthMode(nextMode: AuthMode) {
    const path = AUTH_PATHS[nextMode];
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setAuthMode(nextMode);
  }

  return {
    authMode,
    setAuthMode,
    activePage,
    setActivePage,
    navigateToPage,
    navigateAuthMode
  };
}
