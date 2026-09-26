import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "../api";
import { useAuth, useCan } from "../auth";
import { ROLE_LABEL } from "../format";
import { Avatar } from "./ui";
import { BrandLogos } from "./BrandLogos";
import { MODULE_UI } from "../modules";

export function Layout() {
  const { session, logout } = useAuth();
  const { user, clinic } = session!;
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // Cadastros esperando liberação: o número aparece ao lado de "Liberação" (só para a Arka).
  useEffect(() => {
    if (!can.arka) return;
    const refresh = () =>
      api
        .get<{ counts: Record<string, number> }>("/platform/clinics?status=PENDING")
        .then((r) => setPending(r.counts.PENDING ?? 0))
        .catch(() => {});
    refresh();
    window.addEventListener("arka:clinics-changed", refresh);
    return () => window.removeEventListener("arka:clinics-changed", refresh);
  }, [can.arka, location.pathname]);

  // O menu sai do catálogo de abas: só o que o cargo pode acessar e que já tem tela no site.
  // As rotas e a API conferem de novo.
  const nav = [
    { to: "/", label: "Início", icon: LayoutDashboard, end: true },
    ...(session!.catalog ?? [])
      .filter((m) => can.has(m.key) && MODULE_UI[m.key])
      .map((m) => ({ to: MODULE_UI[m.key].path, label: m.label, icon: MODULE_UI[m.key].icon, end: false })),
  ];
  const arkaNav = [
    { to: "/arka/liberacao", label: "Clínicas e liberação", icon: BadgeCheck, count: pending },
    { to: "/arka/configuracoes", label: "Configurações", icon: Settings, count: 0 },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <BrandLogos tone="light" />
          <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>
        {/* A conta da Arka não é de nenhuma clínica: vê só a área dela. */}
        <div className="sidebar-clinic" title={clinic?.name ?? "Administração da Arka"}>
          {can.arka ? <ShieldCheck size={14} /> : <Building2 size={14} />}
          <span>{clinic?.name ?? "Administração da Arka"}</span>
        </div>

        {!can.arka && (
          <nav>
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className="nav-link">
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
        )}

        {can.arka && (
          <nav aria-label="Administração da Arka">
            {arkaNav.map(({ to, label, icon: Icon, count }) => (
              <NavLink key={to} to={to} className="nav-link">
                <Icon size={18} />
                {label}
                {count > 0 && (
                  <span className="nav-count" aria-label={`${count} esperando`}>
                    {count}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="sidebar-user">
          <NavLink to="/conta" className="sidebar-account" title="Minha conta" aria-label={`Minha conta: ${user.name}`}>
            <Avatar name={user.name} size="sm" />
            <span className="who">
              <strong>{user.name}</strong>
              <small>{user.platformAdmin ? "Arka Tecnologia" : ROLE_LABEL[user.role]}</small>
            </span>
          </NavLink>
          <button className="logout" onClick={logout} title="Sair" aria-label="Sair">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className={`sidebar-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <BrandLogos size="sm" />
          <Link to="/conta" title="Minha conta" aria-label="Minha conta">
            <Avatar name={user.name} size="sm" />
          </Link>
        </header>
        <main className="main-inner">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
