import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setSessionEndedHandler } from "./api";
import type { Clinic, ModuleInfo, User } from "./types";

interface Session {
  user: User;
  /** null para a conta da Arka, que não pertence a nenhuma clínica. */
  clinic: Clinic | null;
  /** Catálogo de abas da plataforma (nome, descrição, dependências). */
  catalog: ModuleInfo[];
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  /** Cria a clínica em análise: não abre sessão até a Arka liberar. */
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
    register: async (data) => {
      await api.post("/auth/register", data);
    },
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

/** O que a sessão atual pode acessar. A tela usa para esconder; quem decide é sempre o servidor. */
export function useCan() {
  const { session } = useAuth();
  const perms = session?.user.permissions ?? [];
  return {
    patients: perms.includes("PATIENTS"),
    consultations: perms.includes("CONSULTATIONS"),
    finance: perms.includes("FINANCE"),
    team: perms.includes("TEAM"),
    arka: !!session?.user.platformAdmin,
    /** Qualquer aba do catálogo, pela chave (use para as abas novas). */
    has: (key: string) => perms.includes(key),
  };
}

/** Catálogo de abas enviado pelo servidor, com um jeito rápido de achar o nome de uma aba. */
export function useCatalog() {
  const { session } = useAuth();
  const catalog = session?.catalog ?? [];
  return { catalog, label: (key: string) => catalog.find((m) => m.key === key)?.label ?? key };
}
