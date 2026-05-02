import { useCallback, useEffect, useState } from "react";
import { normalizeActiveSession } from "../api";
import type { ActiveSession, SessionSnapshot } from "../types/session";

const ACTIVE_COURSE_LANGUAGE_STORAGE_KEY = "lingoflow_active_course_language";
const ACTIVE_SESSIONS_STORAGE_KEY = "lingoflow_active_sessions";

function loadStoredSessionsByLanguage(): Record<string, ActiveSession> {
  if (typeof window === "undefined") return {};
  try {
    const rawMap = window.localStorage.getItem(ACTIVE_SESSIONS_STORAGE_KEY);
    if (rawMap) {
      const parsed = JSON.parse(rawMap);
      if (parsed && typeof parsed === "object") {
        return Object.fromEntries(
          Object.entries(parsed).map(([language, session]) => [language, normalizeActiveSession(session as ActiveSession)])
        );
      }
    }

    const legacyRaw = window.localStorage.getItem("lingoflow_active_session");
    if (!legacyRaw) return {};
    const legacy = JSON.parse(legacyRaw);
    if (!legacy || !legacy.language || !Array.isArray(legacy.questions) || !legacy.questions.length) {
      return {};
    }
    return { [legacy.language]: normalizeActiveSession(legacy) };
  } catch (_error) {
    return {};
  }
}

export function useCourseSessionState() {
  const [activeCourseLanguage, setActiveCourseLanguage] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(ACTIVE_COURSE_LANGUAGE_STORAGE_KEY) || "").trim().toLowerCase();
  });
  const [activeSessionsByLanguage, setActiveSessionsByLanguage] = useState<Record<string, ActiveSession>>(
    () => loadStoredSessionsByLanguage()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeCourseLanguage) return;
    window.localStorage.setItem(ACTIVE_COURSE_LANGUAGE_STORAGE_KEY, activeCourseLanguage);
  }, [activeCourseLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_SESSIONS_STORAGE_KEY, JSON.stringify(activeSessionsByLanguage));
    window.localStorage.removeItem("lingoflow_active_session");
  }, [activeSessionsByLanguage]);

  const clearActiveSession = useCallback((language: string) => {
    setActiveSessionsByLanguage((prev) => {
      const next = { ...prev };
      delete next[language];
      return next;
    });
  }, []);

  const clearAllActiveSessions = useCallback(() => {
    setActiveSessionsByLanguage({});
  }, []);

  const saveSessionSnapshot = useCallback((language: string, snapshot: SessionSnapshot) => {
    setActiveSessionsByLanguage((prev) => {
      if (!language || !prev[language]) return prev;
      return {
        ...prev,
        [language]: {
          ...prev[language],
          resumeState: snapshot
        }
      };
    });
  }, []);

  return {
    activeCourseLanguage,
    setActiveCourseLanguage,
    activeSessionsByLanguage,
    setActiveSessionsByLanguage,
    clearActiveSession,
    clearAllActiveSessions,
    saveSessionSnapshot
  };
}
