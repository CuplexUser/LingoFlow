import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_PATHS, PAGE_PATHS } from "../constants";
import { getPageFromPathname } from "../utils/theme";

export type AuthMode = "login" | "register" | "forgotPassword" | "resetPassword";
export type AppPage = "bookmarks" | "learn" | "practice" | "story" | "contribute" | "setup" | "stats" | "admin";

export function getAuthModeFromPathname(pathname: string): AuthMode {
  if (pathname === AUTH_PATHS.register) return "register";
  if (pathname === AUTH_PATHS.forgotPassword) return "forgotPassword";
  if (pathname === AUTH_PATHS.resetPassword) return "resetPassword";
  return "login";
}

// When a signed-out visitor deep-links to a protected page (e.g. /story), the
// normalize effect below rewrites the URL to /login, which would otherwise lose
// their intended destination. Capture it from the very first render so we can
// restore it once they authenticate.
function deepLinkedPage(pathname: string): AppPage | null {
  const protectedPaths = Object.values(PAGE_PATHS) as string[];
  return protectedPaths.includes(pathname) ? getPageFromPathname(pathname) : null;
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

  // Captured once on first render, before any URL normalization runs, so a
  // deep link survives the redirect through /login.
  const pendingPageRef = useRef<AppPage | null>(
    typeof window === "undefined" ? null : deepLinkedPage(window.location.pathname)
  );
  const consumePendingPage = useCallback((): AppPage | null => {
    const page = pendingPageRef.current;
    pendingPageRef.current = null;
    return page;
  }, []);

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

  const navigateToPage = useCallback((nextPage: AppPage) => {
    const pagePathMap: Record<AppPage, string> = {
      learn: PAGE_PATHS.learn,
      practice: PAGE_PATHS.practice,
      story: PAGE_PATHS.story,
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
  }, []);

  const navigateAuthMode = useCallback((nextMode: AuthMode) => {
    const path = AUTH_PATHS[nextMode];
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setAuthMode(nextMode);
  }, []);

  return {
    authMode,
    setAuthMode,
    activePage,
    setActivePage,
    navigateToPage,
    navigateAuthMode,
    consumePendingPage
  };
}
