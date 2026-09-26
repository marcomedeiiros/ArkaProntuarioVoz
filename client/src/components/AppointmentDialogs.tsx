import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, LoaderCircle, MessageCircle, Stethoscope, Trash2, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { useCan } from "../auth";
import { ageLabel, formatPhone, whatsappLink } from "../format";
import { addMinutes, fromInputs, time, toDateInput, toTimeInput } from "../calendar";
import { FormError, Modal } from "./ui";
import { useToast } from "./toast";
import type { Appointment, AppointmentKind, AppointmentStatus, Patient, Professional } from "../types";

export const KIND_LABEL: Record<AppointmentKind, string> = {
  PUERICULTURA: "Puericultura",
  URGENCIA: "Consulta geral",
  RETORNO: "Retorno",
  OUTRO: "Outro",
};

export const APPT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Marcado",
  CONFIRMED: "Confirmado",
  ARRIVED: "Chegou",
  DONE: "Atendido",
  CANCELED: "Cancelado",
  NO_SHOW: "Faltou",
};

const DURATIONS = [15, 20, 30, 40, 45, 60, 90];

/** Marcar um horário novo ou remarcar um existente. */
export function AppointmentForm({
  initial,
  start,
  professionals,
  defaultDoctorId,
  onClose,
  onSaved,
}: {
  initial?: Appointment;
  start?: Date;
  professionals: Professional[];
  defaultDoctorId?: string;
  onClose: () => void;
  onSaved: (appt: Appointment) => void;
}) {
  const toast = useToast();
  const begin = initial ? new Date(initial.startsAt) : (start ?? new Date());
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    patientId: initial?.patientId ?? "",
    doctorId: initial?.doctorId ?? defaultDoctorId ?? professionals[0]?.id ?? "",
    date: toDateInput(begin),
    time: toTimeInput(begin),
    duration: initial ? Math.round((+new Date(initial.endsAt) - +new Date(initial.startsAt)) / 60_000) : 30,
    kind: (initial?.kind ?? "PUERICULTURA") as AppointmentKind,
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Patient[]>("/patients").then(setPatients);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = patients ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || p.guardianName.toLowerCase().includes(q)) : list;
  }, [patients, query]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.patientId) return setError("Escolha o paciente");
    setBusy(true);
    setError(null);
    const startsAt = fromInputs(form.date, form.time);
    const body = {
      doctorId: form.doctorId,
      startsAt: startsAt.toISOString(),
      endsAt: addMinutes(startsAt, form.duration).toISOString(),
      kind: form.kind,
      notes: form.notes,
    };
    try {
      const saved = initial
        ? await api.patch<Appointment>(`/appointments/${initial.id}`, body)
        : await api.post<Appointment>("/appointments", { ...body, patientId: form.patientId });
      toast(initial ? "Horário remarcado" : "Horário marcado");
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal title={initial ? "Remarcar horário" : "Novo horário"} subtitle={initial?.patient.name} onClose={onClose} width={560}>
      <form className="form-grid" onSubmit={submit}>
        {!initial && (
          <div className="field col-span-2">
            <span className="field-label">Paciente</span>
            <input
              className="input"
              placeholder="Buscar pela criança ou pelo responsável"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <select
              className="select"
              size={Math.min(5, Math.max(2, shown.length))}
              value={form.patientId}
              onChange={(e) => set("patientId", e.target.value)}
              aria-label="Paciente"
              required
            >
              {!patients && <option disabled>Carregando...</option>}
              {shown.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {ageLabel(p.birthDate)}, resp. {p.guardianName}
                </option>
              ))}
            </select>
            {patients && patients.length === 0 && <span className="field-hint">Cadastre o paciente em Pacientes antes de marcar</span>}
          </div>
        )}
        <label className="field col-span-2">
          <span className="field-label">Profissional</span>
          <select className="select" value={form.doctorId} onChange={(e) => set("doctorId", e.target.value)} required>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Dia</span>
          <input className="input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Início</span>
          <input className="input" type="time" step={300} value={form.time} onChange={(e) => set("time", e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Duração</span>
          <select className="select" value={form.duration} onChange={(e) => set("duration", Number(e.target.value))}>
            {[...new Set([...DURATIONS, form.duration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Tipo</span>
          <select className="select" value={form.kind} onChange={(e) => set("kind", e.target.value as AppointmentKind)}>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field col-span-2">
          <span className="field-label">Observações</span>
          <input className="input" maxLength={500} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: vacina dos 4 meses" />
        </label>
        <FormError message={error} />
        <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {initial ? "Salvar horário" : "Marcar horário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** O que se faz com um horário: confirmar, marcar chegada, falta, cancelar, remarcar, atender. */
export function AppointmentDetail({
  appt,
  onClose,
  onChanged,
  onReschedule,
}: {
  appt: Appointment;
  onClose: () => void;
  onChanged: () => void;
  onReschedule: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const can = useCan();
  const [busy, setBusy] = useState<string | null>(null);
  const start = new Date(appt.startsAt);
  const closed = appt.status === "CANCELED" || appt.status === "NO_SHOW";

  async function setStatus(status: AppointmentStatus) {
    setBusy(status);
    try {
      await api.patch(`/appointments/${appt.id}`, { status });
      toast(`Horário: ${APPT_STATUS_LABEL[status].toLowerCase()}`);
      onChanged();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function startVisit() {
    setBusy("start");
    try {
      const { consultationId } = await api.post<{ consultationId: string }>(`/appointments/${appt.id}/start`);
      navigate(`/consultas/${consultationId}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Apagar este horário? Use só para horário marcado por engano. Para desmarcar, use Cancelar.")) return;
    setBusy("delete");
    try {
      await api.delete(`/appointments/${appt.id}`);
      toast("Horário apagado");
      onChanged();
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(null);
    }
  }

  const when = start.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const message =
    `Olá, ${appt.patient.guardianName.split(" ")[0]}! Confirmando a consulta de ${appt.patient.name.split(" ")[0]} ` +
    `${when}, às ${time(start)}, com ${appt.doctorName}. Responda SIM para confirmar ou avise se precisar remarcar.`;

  return (
    <Modal title={appt.patient.name} subtitle={`${KIND_LABEL[appt.kind]} com ${appt.doctorName}`} onClose={onClose} width={520}>
      <div className="appt-detail">
        <p className="appt-when">
          <CalendarClock size={18} />
          <span>
            <strong>
              {when.charAt(0).toUpperCase() + when.slice(1)}, {time(start)} às {time(appt.endsAt)}
            </strong>
            <small>
              {APPT_STATUS_LABEL[appt.status]}. {ageLabel(appt.patient.birthDate)}, resp. {appt.patient.guardianName},{" "}
              {formatPhone(appt.patient.guardianPhone)}
            </small>
          </span>
        </p>
        {appt.patient.allergies && (
          <p className="appt-alert">
            <TriangleAlert size={15} /> Alergia: {appt.patient.allergies}
          </p>
        )}
        {appt.notes && <p className="appt-notes">{appt.notes}</p>}

        {!closed && appt.status !== "DONE" && (
          <div className="appt-steps" aria-label="Etapa do horário">
            {(["SCHEDULED", "CONFIRMED", "ARRIVED"] as AppointmentStatus[]).map((s) => (
              <button
                key={s}
                className={`appt-step ${appt.status === s ? "is-current" : ""}`}
                disabled={busy !== null || appt.status === s}
                onClick={() => setStatus(s)}
              >
                {APPT_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}

        <div className="appt-actions">
          {can.consultations && !closed && (
            <button className="btn btn-primary" onClick={startVisit} disabled={busy !== null}>
              {busy === "start" ? <LoaderCircle size={16} className="spin" /> : <Stethoscope size={16} />}
              {appt.consultationId ? "Abrir consulta" : "Iniciar atendimento"}
            </button>
          )}
          {!closed && appt.status !== "DONE" && (
            <a className="btn btn-secondary" href={whatsappLink(appt.patient.guardianPhone, message)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> Confirmar pelo WhatsApp
            </a>
          )}
          {!closed && appt.status !== "DONE" && (
            <button className="btn btn-secondary" onClick={onReschedule} disabled={busy !== null}>
              Remarcar
            </button>
          )}
        </div>

        <div className="appt-secondary">
          {!closed && appt.status !== "DONE" && (
            <>
              <button className="btn btn-sm btn-ghost" onClick={() => setStatus("NO_SHOW")} disabled={busy !== null}>
                Marcar falta
              </button>
              <button className="btn btn-sm btn-danger-ghost" onClick={() => setStatus("CANCELED")} disabled={busy !== null}>
                Cancelar horário
              </button>
            </>
          )}
          {closed && (
            <button className="btn btn-sm btn-ghost" onClick={() => setStatus("SCHEDULED")} disabled={busy !== null}>
              Voltar para marcado
            </button>
          )}
          <button className="btn btn-sm btn-danger-ghost appt-delete" onClick={remove} disabled={busy !== null}>
            <Trash2 size={14} /> Apagar
          </button>
        </div>
      </div>
    </Modal>
  );
}
