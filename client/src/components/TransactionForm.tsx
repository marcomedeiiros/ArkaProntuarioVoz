import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, LoaderCircle } from "lucide-react";
import { api } from "../api";
import { METHOD_LABEL, today } from "../format";
import { FormError } from "./ui";
import { useToast } from "./toast";
import type { Category, PaymentMethod, Transaction, TransactionStatus, TransactionType } from "../types";

/** Aceita "1.500,00", "350,5" e "350.50". Com vírgula, o ponto é separador de milhar. */
function parseAmount(value: string): number {
  const v = value.trim();
  return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
}

interface Props {
  /** Quando informado, trava o tipo (ex.: pagamento de consulta é sempre receita). */
  fixedType?: TransactionType;
  patientId?: string;
  consultationId?: string;
  defaultCategoryName?: string;
  onCreated: (t: Transaction) => void;
  onCancel?: () => void;
}

export function TransactionForm({ fixedType, patientId, consultationId, defaultCategoryName, onCreated, onCancel }: Props) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<TransactionType>(fixedType ?? "INCOME");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<TransactionStatus>("PAID");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Category[]>("/finance/categories").then(setCategories);
  }, []);

  const options = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  useEffect(() => {
    if (options.some((c) => c.id === categoryId)) return;
    const preferred = options.find((c) => c.name === defaultCategoryName) ?? options[0];
    setCategoryId(preferred?.id ?? "");
  }, [options, categoryId, defaultCategoryName]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api.post<Transaction>("/finance/transactions", {
        type,
        amount: parseAmount(amount),
        method,
        categoryId,
        date,
        status,
        description: description || null,
        patientId: patientId ?? null,
        consultationId: consultationId ?? null,
      });
      setAmount("");
      setDescription("");
      toast("Lançamento registrado");
      onCreated(t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const income = type === "INCOME";

  return (
    <form className="form-grid" onSubmit={submit}>
      {!fixedType && (
        <div className="segmented full col-span-2">
          <button type="button" className={income ? "active" : ""} onClick={() => setType("INCOME")}>
            <ArrowDownLeft size={15} /> Entrada
          </button>
          <button type="button" className={!income ? "active" : ""} onClick={() => setType("EXPENSE")}>
            <ArrowUpRight size={15} /> Saída
          </button>
        </div>
      )}
      <label className="field">
        <span className="field-label">Valor</span>
        <div className="input-group">
          <span className="input-suffix" style={{ left: 12, right: "auto" }}>
            R$
          </span>
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            required
          />
        </div>
      </label>
      <label className="field">
        <span className="field-label">Forma de pagamento</span>
        <select className="select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {Object.entries(METHOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Categoria</span>
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Data</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">Situação</span>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus)}>
          <option value="PAID">{income ? "Recebido" : "Pago"}</option>
          <option value="PENDING">{income ? "A receber" : "A pagar"}</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Descrição (opcional)</span>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <FormError message={error} />
      <div className="btn-row col-span-2" style={{ justifyContent: "flex-end" }}>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="btn btn-primary" disabled={busy || !categoryId}>
          {busy && <LoaderCircle size={16} className="spin" />}
          {fixedType ? "Registrar pagamento" : "Salvar lançamento"}
        </button>
      </div>
    </form>
  );
}
