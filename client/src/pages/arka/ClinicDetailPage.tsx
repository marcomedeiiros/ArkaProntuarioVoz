import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CircleUser, LayoutDashboard, LoaderCircle } from "lucide-react";
import { api } from "../../api";
import { dateTimeBR, plural, ROLE_LABEL } from "../../format";
import { MODULE_UI } from "../../modules";
import { PageHeader, PageLoader } from "../../components/ui";
import { useToast } from "../../components/toast";
import type { ClinicStatus, ModuleInfo, Role } from "../../types";

interface ClinicDetail {
  id: string;
  name: string;
  status: ClinicStatus;
  statusReason: string | null;
  createdAt: string;
  provisionedAt: string | null;
  modules: string[];
  owner: { name: string; email: string } | null;
  roles: Record<Role, string[]>;
  team: Partial<Record<Role, number>>;
  catalog: ModuleInfo[];
}

const STATUS: Record<ClinicStatus, string> = {
  PENDING: "Esperando liberação",
  ACTIVE: "Liberada",
  SUSPENDED: "Suspensa",
  REJECTED: "Recusada",
};
const ROLES: Role[] = ["ADMIN", "DOCTOR", "SECRETARY"];

/**
 * O que uma empresa enxerga na plataforma. A Arka liga e desliga as abas da empresa; a prévia mostra
 * o menu de cada cargo como a clínica vê (a distribuição entre cargos é da própria clínica).
 */
export function ClinicDetailPage() {
  const { id } = useParams();
  const toast = useToast();
  const [clinic, setClinic] = useState<ClinicDetail | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [role, setRole] = useState<Role>("ADMIN");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<ClinicDetail>(`/platform/clinics/${id}`).then((c) => {
      setClinic(c);
      setDraft(c.modules);
    });
  }, [id]);

  if (!clinic) return <PageLoader />;

  const order = (keys: string[]) => clinic.catalog.map((m) => m.key).filter((k) => keys.includes(k));
  const label = (key: string) => clinic.catalog.find((m) => m.key === key)?.label ?? key;

  // Dependências do catálogo (ex.: Consultas precisa de Pacientes), iguais às do servidor.
  function toggle(key: string) {
    setDraft((current) => {
      const set = new Set(current);
      if (set.has(key)) {
        set.delete(key);
        for (const m of clinic!.catalog) if (m.requires.includes(key)) set.delete(m.key);
      } else {
        set.add(key);
        for (const r of clinic!.catalog.find((m) => m.key === key)?.requires ?? []) set.add(r);
      }
      return order([...set]);
    });
  }

  const dirty = draft.join() !== clinic.modules.join();

  async function save() {
    setBusy(true);
    try {
      const c = await api.put<ClinicDetail>(`/platform/clinics/${clinic!.id}/modules`, { modules: draft });
      setClinic(c);
      setDraft(c.modules);
      toast(`Abas de ${c.name} salvas. Já valem para todos da clínica.`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  // O que o cargo escolhido vê com as abas do rascunho (a administração vê tudo o que a empresa tem).
  const visible = role === "ADMIN" ? draft : clinic.roles[role].filter((k) => draft.includes(k));
  const people = clinic.team[role] ?? 0;

  return (
    <>
      <PageHeader
        back={{ to: "/arka/liberacao", label: "Clínicas e liberação" }}
        title={clinic.name}
        subtitle={
          <>
            {clinic.owner ? `${clinic.owner.name}, ${clinic.owner.email}` : "Sem administrador"}. {STATUS[clinic.status]}
            {clinic.statusReason ? `: ${clinic.statusReason}` : ""}. Cadastrou em {dateTimeBR(clinic.createdAt)}
          </>
        }
        actions={
          <>
            {dirty && (
              <button className="btn btn-secondary" onClick={() => setDraft(clinic.modules)} disabled={busy}>
                Desfazer
              </button>
            )}
            <button className="btn btn-primary" onClick={save} disabled={!dirty || busy}>
              {busy && <LoaderCircle size={16} className="spin" />}
              Salvar abas
            </button>
          </>
        }
      />

      <div className="company-grid">
        <section className="card" aria-labelledby="abas-title">
          <div className="card-header">
            <div>
              <h2 id="abas-title" className="card-title">
                Abas desta empresa
              </h2>
              <p className="card-subtitle">Desligar tira a aba de todos da clínica na hora os dados continuam guardados</p>
            </div>
          </div>
          <ul className="company-modules">
            {clinic.catalog.map((m) => {
              const on = draft.includes(m.key);
              const Icon = MODULE_UI[m.key]?.icon;
              return (
                <li key={m.key}>
                  <label className={`company-module ${on ? "is-on" : ""}`}>
                    <span className="toggle-switch">
                      <input type="checkbox" checked={on} onChange={() => toggle(m.key)} />
                      <span aria-hidden="true" />
                    </span>
                    {Icon && <Icon size={18} className="company-module-icon" aria-hidden="true" />}
                    <span className="company-module-text">
                      <strong>{m.label}</strong>
                      <small>
                        {m.description}
                        {m.requires.length > 0 && `. Precisa de ${m.requires.map(label).join(" e ")}`}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card" aria-labelledby="previa-title">
          <div className="card-header">
            <div>
              <h2 id="previa-title" className="card-title">
                O que cada cargo vê
              </h2>
              <p className="card-subtitle">A clínica escolhe o que médicos e secretárias recebem entre as abas liberadas</p>
            </div>
          </div>
          <div className="card-body">
            <div className="segmented" role="tablist" aria-label="Cargo">
              {ROLES.map((r) => (
                <button key={r} role="tab" aria-selected={role === r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>

            {/* Prévia do menu, desenhada como a barra lateral da clínica. */}
            <div className="menu-preview" aria-label={`Menu de ${ROLE_LABEL[role]} em ${clinic.name}`}>
              <div className="menu-preview-clinic">{clinic.name}</div>
              <span className="menu-preview-item">
                <LayoutDashboard size={15} /> Início
              </span>
              {visible.map((k) => {
                const Icon = MODULE_UI[k]?.icon;
                return (
                  <span key={k} className="menu-preview-item">
                    {Icon && <Icon size={15} />} {label(k)}
                  </span>
                );
              })}
              <span className="menu-preview-item is-account">
                <CircleUser size={15} /> Minha conta
              </span>
            </div>
            <p className="field-hint">
              {plural(people, "pessoa", "pessoas")} com o cargo {ROLE_LABEL[role]} nesta clínica
              {role !== "ADMIN" && visible.length === 0 && " Hoje este cargo só vê o início e a própria conta."}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}