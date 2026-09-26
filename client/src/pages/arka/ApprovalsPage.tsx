import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, LayoutGrid, LoaderCircle } from "lucide-react";
import { useCatalog } from "../../auth";
import { api } from "../../api";
import { dateTimeBR, plural } from "../../format";
import { FormError, Modal, PageHeader, PageLoader } from "../../components/ui";
import { useToast } from "../../components/toast";
import type { ClinicStatus, Permission } from "../../types";


interface ClinicRow {
  id: string;
  name: string;
  status: ClinicStatus;
  statusReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  owner: { name: string; email: string } | null;
  users: number;
  modules: Permission[];
}
interface ClinicList {
  clinics: ClinicRow[];
  counts: Partial<Record<ClinicStatus, number>>;
}

type Action = "approve" | "reject" | "suspend" | "reactivate";

const TABS: { status: ClinicStatus; label: string }[] = [
  { status: "PENDING", label: "Esperando" },
  { status: "ACTIVE", label: "Liberadas" },
  { status: "SUSPENDED", label: "Suspensas" },
  { status: "REJECTED", label: "Recusadas" },
];

/** O que dá para fazer em cada situação, com o mesmo nome no botão e no aviso de confirmação. */
const ACTIONS: Record<ClinicStatus, { action: Action; label: string; done: string; danger?: boolean; asksReason?: boolean }[]> = {
  PENDING: [
    { action: "approve", label: "Liberar", done: "Clínica liberada" },
    { action: "reject", label: "Recusar", done: "Cadastro recusado", danger: true, asksReason: true },
  ],
  ACTIVE: [{ action: "suspend", label: "Suspender", done: "Clínica suspensa", danger: true, asksReason: true }],
  SUSPENDED: [{ action: "reactivate", label: "Reativar", done: "Clínica reativada" }],
  REJECTED: [{ action: "approve", label: "Liberar", done: "Clínica liberada" }],
};

export function ApprovalsPage() {
  const toast = useToast();
  const { catalog } = useCatalog();
  const [tab, setTab] = useState<ClinicStatus>("PENDING");
  const [data, setData] = useState<ClinicList | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ clinic: ClinicRow; action: (typeof ACTIONS)[ClinicStatus][number] } | null>(null);

  const load = useCallback(() => {
    api.get<ClinicList>(`/platform/clinics?status=${tab}`).then(setData);
  }, [tab]);
  useEffect(load, [load]);

  async function run(clinic: ClinicRow, action: (typeof ACTIONS)[ClinicStatus][number], reason?: string) {
    setBusy(clinic.id);
    try {
      await api.post(`/platform/clinics/${clinic.id}/${action.action}`, reason ? { reason } : {});
      toast(`${action.done}: ${clinic.name}`);
      setAsking(null);
      load();
      window.dispatchEvent(new Event("arka:clinics-changed")); // atualiza o número no menu
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const counts = data?.counts ?? {};

  return (
    <>
      <PageHeader
        title="Clínicas e liberação"
        subtitle="Liberar cria o espaço de dados próprio da clínica, e os módulos definem o que cada empresa pode usar"
      />

      <div className="segmented review-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.status} role="tab" aria-selected={tab === t.status} className={tab === t.status ? "active" : ""} onClick={() => setTab(t.status)}>
            {t.label}
            {(counts[t.status] ?? 0) > 0 && <span className="tab-count">{counts[t.status]}</span>}
          </button>
        ))}
      </div>

      {!data ? (
        <PageLoader />
      ) : data.clinics.length === 0 ? (
        <p className="queue-empty">
          {tab === "PENDING"
            ? "Nenhum cadastro esperando liberação quando uma clínica se cadastrar pelo site, ela aparece aqui"
            : "Nenhuma clínica nesta situação"}
        </p>
      ) : (
        <ol className="review-list">
          {data.clinics.map((c) => (
            <li key={c.id} className={`review-row is-${c.status.toLowerCase()}`}>
              <div className="review-who">
                <Link to={`/arka/clinicas/${c.id}`} className="review-name">
                  {c.name}
                </Link>
                <span>
                  {c.owner ? `${c.owner.name}, ${c.owner.email}` : "Sem administrador"}
                </span>
                <small>
                  Cadastrou em {dateTimeBR(c.createdAt)}
                  {c.status !== "PENDING" && `, ${plural(c.users, "pessoa", "pessoas")} na equipe`}
                  {c.statusReason && `. Motivo: ${c.statusReason}`}
                </small>
                <span className="module-chips" aria-label="Módulos da clínica">
                  {catalog.map((m) => (
                    <span key={m.key} className={`module-chip ${c.modules.includes(m.key) ? "is-on" : ""}`}>
                      {m.label}
                    </span>
                  ))}
                </span>
              </div>
              <div className="review-actions">
                <Link to={`/arka/clinicas/${c.id}`} className="btn btn-sm btn-ghost">
                  <LayoutGrid size={15} /> Abas
                </Link>
                {ACTIONS[c.status].map((a) => (
                    <button
                      key={a.action}
                      className={`btn btn-sm ${a.danger ? "btn-danger-ghost" : "btn-primary"}`}
                      disabled={busy === c.id}
                      onClick={() => (a.asksReason ? setAsking({ clinic: c, action: a }) : run(c, a))}
                    >
                      {busy === c.id && !a.danger ? <LoaderCircle size={14} className="spin" /> : a.action === "approve" && <BadgeCheck size={15} />}
                      {a.label}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      {asking && (
        <ReasonModal
          title={`${asking.action.label} ${asking.clinic.name}`}
          confirm={asking.action.label}
          hint={
            asking.action.action === "suspend"
              ? "A clínica perde o acesso na hora e todas as sessões abertas caem os dados continuam guardados"
              : "Quem se cadastrou vê o motivo ao tentar entrar"
          }
          busy={busy === asking.clinic.id}
          onClose={() => setAsking(null)}
          onConfirm={(reason) => run(asking.clinic, asking.action, reason)}
        />
      )}
    </>
  );
}

function ReasonModal({
  title,
  confirm,
  hint,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  confirm: string;
  hint: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length > 300) return setError("Use até 300 caracteres");
    onConfirm(reason.trim());
  }

  return (
    <Modal title={title} onClose={onClose} width={480}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field col-span-2">
          <span className="field-label">Motivo (opcional)</span>
          <textarea className="textarea" rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
          <span className="field-hint">{hint}</span>
        </label>
        <FormError message={error} />
        <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-danger" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {confirm}
          </button>
        </div>
      </form>
    </Modal>
  );
}

