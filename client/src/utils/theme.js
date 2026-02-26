import { PAGE_PATHS } from "../constants";

export function getPageFromPathname(pathname) {
  if (pathname === PAGE_PATHS.setup) return "setup";
  if (pathname === PAGE_PATHS.stats) return "stats";
  return "learn";
}

export function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(themeMode) {
  if (themeMode === "light" || themeMode === "dark") return themeMode;
  return getSystemTheme();
}
