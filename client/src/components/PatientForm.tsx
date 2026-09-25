import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { FormError } from "./ui";
import { formatPhone } from "../format";
import type { Patient } from "../types";

export type PatientInput = Omit<Patient, "id">;

const empty: PatientInput = {
  name: "",
  birthDate: "",
  sex: "F",
  guardianName: "",
  guardianPhone: "",
  allergies: "",
  notes: "",
};

interface Props {
  initial?: Patient;
  onSubmit: (data: PatientInput) => Promise<void>;
  onCancel: () => void;
}

export function PatientForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<PatientInput>(
    initial ? { ...initial, birthDate: initial.birthDate.slice(0, 10), guardianPhone: formatPhone(initial.guardianPhone) } : empty,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set =
    (key: keyof PatientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="divider-label col-span-2">Criança</div>
      <label className="field col-span-2">
        <span className="field-label">Nome completo</span>
        <input className="input" value={form.name} onChange={set("name")} required autoFocus />
      </label>
      <label className="field">
        <span className="field-label">Data de nascimento</span>
        <input className="input" type="date" value={form.birthDate} onChange={set("birthDate")} required />
      </label>
      <label className="field">
        <span className="field-label">Sexo</span>
        <select className="select" value={form.sex} onChange={set("sex")}>
          <option value="F">Feminino</option>
          <option value="M">Masculino</option>
        </select>
      </label>
      <label className="field col-span-2">
        <span className="field-label">Alergias</span>
        <input
          className="input"
          value={form.allergies ?? ""}
          onChange={set("allergies")}
          placeholder="Ex.: amoxicilina, proteína do leite de vaca"
        />
        <span className="field-hint">Aparece em destaque em todas as consultas</span>
      </label>

      <div className="divider-label col-span-2">Responsável</div>
      <label className="field">
        <span className="field-label">Nome do responsável</span>
        <input className="input" value={form.guardianName} onChange={set("guardianName")} required />
      </label>
      <label className="field">
        <span className="field-label">WhatsApp</span>
        <input
          className="input"
          inputMode="tel"
          value={form.guardianPhone}
          onChange={set("guardianPhone")}
          placeholder="(27) 99999-9999"
          required
        />
      </label>
      <label className="field col-span-2">
        <span className="field-label">Observações</span>
        <textarea className="textarea" rows={2} value={form.notes ?? ""} onChange={set("notes")} />
      </label>

      <FormError message={error} />
      <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy && <LoaderCircle size={16} className="spin" />}
          {initial ? "Salvar alterações" : "Cadastrar paciente"}
        </button>
      </div>
    </form>
  );
}
