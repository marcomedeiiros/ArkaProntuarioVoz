import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LoaderCircle, X, type LucideIcon } from "lucide-react";
import { STATUS_LABEL } from "../format";
import type { ConsultationStatus } from "../types";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link to={back.to} className="back-link">
            <ArrowLeft size={15} /> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="btn-row">{actions}</div>}
    </header>
  );
}

type Tone = "blue" | "green" | "amber" | "violet" | "red";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon tone-${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="label">{label}</div>
        <div className="value">{value}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
    </div>
  );
}

const STATUS_TONE: Record<ConsultationStatus, string> = {
  DRAFT: "badge-neutral",
  GENERATED: "badge-warning",
  FINALIZED: "badge-success",
};

export function StatusBadge({ status }: { status: ConsultationStatus }) {
  return <span className={`badge ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

// Tons da própria marca (tinta, verde-água, ardósia): cada pessoa mantém a sua cor, mas as iniciais
// não competem com os sinais que importam (a faixa âmbar de "revisar", o vermelho de alergia).
const AVATAR_COLORS = ["#13285a", "#1f4f7a", "#04877c", "#3b4a63", "#2c6788", "#0f6660"];

export function Avatar({ name, size }: { name: string; size?: "sm" | "lg" }) {
  const initials = name
    .replace(/^(Dra?\.)\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ""}`} style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}>
      {initials}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="icon">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <LoaderCircle className="spin" size={28} />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="form-error col-span-2">{message}</div>;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { maxWidth: width } : undefined}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
