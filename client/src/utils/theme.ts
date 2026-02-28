import { PAGE_PATHS, type ThemeMode } from "../constants";

export function getPageFromPathname(pathname: string): "learn" | "setup" | "stats" {
  if (pathname === PAGE_PATHS.setup) return "setup";
  if (pathname === PAGE_PATHS.stats) return "stats";
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
