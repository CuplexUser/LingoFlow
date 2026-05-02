import { createContext, useContext } from "react";
import type { AuthUser } from "../api";
import type { AuthMode } from "../hooks/useAppNavigation";

export type AuthContextValue = {
  authUser: AuthUser | null;
  authBusy: boolean;
  authError: string;
  authNotice: string;
  loginFailureCount: number;
  resetToken: string;
  loading: boolean;
  login: (form: { email: string; password: string }) => Promise<void>;
  register: (form: { displayName: string; email: string; password: string }) => Promise<void>;
  signOut: () => void;
  deleteAccount: (form: { password: string; confirmDelete: boolean }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (form: { token: string; password: string }) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  startGoogleOAuth: () => void;
  handleNavigateAuthMode: (mode: AuthMode) => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AppProvider");
  return ctx;
}
