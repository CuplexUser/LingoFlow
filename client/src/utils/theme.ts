import { PAGE_PATHS, type ThemeMode } from "../constants";

export function getPageFromPathname(
  pathname: string
): "bookmarks" | "learn" | "practice" | "contribute" | "setup" | "stats" | "admin" {
  if (pathname === PAGE_PATHS.bookmarks) return "bookmarks";
  if (pathname === PAGE_PATHS.contribute) return "contribute";
  if (pathname === PAGE_PATHS.practice) return "practice";
  if (pathname === PAGE_PATHS.setup) return "setup";
  if (pathname === PAGE_PATHS.stats) return "stats";
  if (pathname === PAGE_PATHS.admin) return "admin";
  return "learn";
}

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(themeMode: ThemeMode): "light" | "dark" {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  return getSystemTheme();
}
