import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Building2, LayoutDashboard, LogOut, Menu, Stethoscope, UserCog, Users, Wallet, X } from "lucide-react";
import { useAuth } from "../auth";
import { ROLE_LABEL } from "../format";
import { Avatar } from "./ui";
import { BrandLogos } from "./BrandLogos";

export function Layout() {
  const { session, logout } = useAuth();
  const { user, clinic } = session!;
  const clinical = user.role !== "SECRETARY";
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const nav = [
    { to: "/", label: "Início", icon: LayoutDashboard, end: true },
    { to: "/pacientes", label: "Pacientes", icon: Users },
    ...(clinical ? [{ to: "/consultas", label: "Consultas", icon: Stethoscope }] : []),
    { to: "/financeiro", label: "Financeiro", icon: Wallet },
    { to: "/equipe", label: "Equipe", icon: UserCog },
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
        <div className="sidebar-clinic" title={clinic.name}>
          <Building2 size={14} />
          <span>{clinic.name}</span>
        </div>

        <nav>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-link">
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-user">
          <NavLink to="/conta" className="sidebar-account" title="Minha conta" aria-label={`Minha conta: ${user.name}`}>
            <Avatar name={user.name} size="sm" />
            <span className="who">
              <strong>{user.name}</strong>
              <small>{ROLE_LABEL[user.role]}</small>
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
