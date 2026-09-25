import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setSessionEndedHandler } from "./api";
import type { Clinic, User } from "./types";

interface Session {
  user: User;
  clinic: Clinic;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (data: { clinicName: string; name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // O cookie é httpOnly, então a única forma de saber se há sessão é perguntar ao servidor.
    api
      .get<Session>("/auth/me")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    setSessionEndedHandler(() => setSession(null));
    return () => setSessionEndedHandler(null);
  }, []);

  const value: AuthContextValue = {
    session,
    loading,
    login: async (email, password, remember = false) =>
      setSession(await api.post<Session>("/auth/login", { email, password, remember })),
    register: async (data) => setSession(await api.post<Session>("/auth/register", data)),
    logout: async () => {
      await api.post("/auth/logout").catch(() => {});
      setSession(null);
    },
    logoutEverywhere: async () => {
      await api.post("/auth/logout-all");
      setSession(null);
    },
    changePassword: async (currentPassword, newPassword) =>
      setSession(await api.post<Session>("/auth/change-password", { currentPassword, newPassword })),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
