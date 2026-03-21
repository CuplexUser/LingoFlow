import { useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY, type ThemeMode } from "../constants";
import { getSystemTheme, resolveTheme } from "../utils/theme";

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
  });

  const activeTheme = useMemo(() => resolveTheme(themeMode), [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    if (themeMode !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.setAttribute("data-theme", getSystemTheme());
    };
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [themeMode]);

  return {
    themeMode,
    setThemeMode,
    activeTheme
  };
}
