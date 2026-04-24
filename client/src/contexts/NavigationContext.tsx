import { createContext, useContext, type ReactNode } from "react";
import {
  useAppNavigation,
  type AuthMode,
  type AppPage,
} from "../hooks/useAppNavigation";

export type NavigationContextValue = {
  activePage: AppPage;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  navigateToPage: (page: AppPage) => void;
  navigateAuthMode: (mode: AuthMode) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}

type NavigationProviderProps = {
  authenticated: boolean;
  children: ReactNode;
};

export function NavigationProvider({ authenticated, children }: NavigationProviderProps) {
  const { authMode, setAuthMode, activePage, navigateToPage, navigateAuthMode } =
    useAppNavigation({ authenticated });

  return (
    <NavigationContext.Provider
      value={{ activePage, authMode, setAuthMode, navigateToPage, navigateAuthMode }}
    >
      {children}
    </NavigationContext.Provider>
  );
}
