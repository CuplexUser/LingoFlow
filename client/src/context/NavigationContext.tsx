import { createContext, useContext } from "react";
import type { AppPage, AuthMode } from "../hooks/useAppNavigation";

export type NavigationContextValue = {
  authMode: AuthMode;
  activePage: AppPage;
  navigateToPage: (page: AppPage) => void;
  navigateAuthMode: (mode: AuthMode) => void;
};

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within AppProvider");
  return ctx;
}
