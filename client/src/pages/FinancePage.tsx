import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Hourglass,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "../api";
import { brl, capitalize, currentMonth, dateBR, METHOD_LABEL } from "../format";
import { TransactionForm } from "../components/TransactionForm";
import { EmptyState, Modal, PageHeader, PageLoader, StatCard } from "../components/ui";
import { useToast } from "../components/toast";
import type { FinanceSummary, Transaction, TransactionType } from "../types";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return capitalize(new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
}

export function FinancePage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [filter, setFilter] = useState<TransactionType | "ALL">("ALL");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get<Transaction[]>(`/finance/transactions?month=${month}`).then(setTransactions);
    api.get<FinanceSummary>(`/finance/summary?month=${month}`).then(setSummary);
  }, [month]);
  useEffect(load, [load]);

  async function toggleStatus(t: Transaction) {
    await api.patch(`/finance/transactions/${t.id}`, { status: t.status === "PAID" ? "PENDING" : "PAID" });
    toast(t.status === "PAID" ? "Marcado como pendente" : t.type === "INCOME" ? "Marcado como recebido" : "Marcado como pago");
    load();
  }

  async function remove(t: Transaction) {
    if (!confirm(`Excluir lançamento de ${brl(t.amount)}?`)) return;
    await api.delete(`/finance/transactions/${t.id}`);
    toast("Lançamento excluído");
    load();
  }

  const visible = (transactions ?? []).filter((t) => filter === "ALL" || t.type === filter);
  const incomeCategories = summary?.byCategory.filter((c) => c.type === "INCOME") ?? [];
  const expenseCategories = summary?.byCategory.filter((c) => c.type === "EXPENSE") ?? [];
  const maxMethod = Math.max(1, ...(summary?.byMethod.map((m) => m.total) ?? []));
  const maxIncomeCat = Math.max(1, ...incomeCategories.map((c) => c.total));
  const maxExpenseCat = Math.max(1, ...expenseCategories.map((c) => c.total));

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle="Entradas, saídas e valores a receber do consultório"
        actions={
          <>
            <div className="month-nav">
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
                <ChevronLeft size={17} />
              </button>
              <span>{monthLabel(month)}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
                <ChevronRight size={17} />
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={17} /> Novo lançamento
            </button>
          </>
        }
      />

      <div className="stats-grid">
        <StatCard icon={TrendingUp} label="Entradas" value={summary ? brl(summary.income) : "..."} tone="green" />
        <StatCard icon={TrendingDown} label="Saídas" value={summary ? brl(summary.expense) : "..."} tone="red" />
        <StatCard
          icon={CircleDollarSign}
          label="Saldo do mês"
          value={summary ? brl(summary.balance) : "..."}
          tone="blue"
        />
        <StatCard
          icon={Hourglass}
          label="A receber"
          value={summary ? brl(summary.pendingIncome) : "..."}
          hint={summary && summary.pendingExpense > 0 ? `A pagar: ${brl(summary.pendingExpense)}` : undefined}
          tone="amber"
        />
      </div>

      <div className="grid-main-side">
        <section className="card">
          <div className="card-header">
            <div className="card-title">
              <Receipt size={18} /> Lançamentos
            </div>
            <div className="segmented">
              {(["ALL", "INCOME", "EXPENSE"] as const).map((f) => (
                <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                  {f === "ALL" ? "Todos" : f === "INCOME" ? "Entradas" : "Saídas"}
                </button>
              ))}
            </div>
          </div>

          {!transactions ? (
            <PageLoader />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhum lançamento"
              text="Registre entradas e saídas para acompanhar o caixa do mês"
              action={
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <Plus size={17} /> Novo lançamento
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Data</th>
                    <th>Forma</th>
                    <th>Situação</th>
                    <th className="num">Valor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t.id}>
                      <td className="primary-cell">
                        <div className="cell-main">
                          <div className={`stat-icon ${t.type === "INCOME" ? "tone-green" : "tone-red"}`} style={{ width: 34, height: 34 }}>
                            {t.type === "INCOME" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                          </div>
                          <div>
                            <strong>{t.category.name}</strong>
                            <small>{[t.patient?.name, t.description].filter(Boolean).join(" · ") || "Sem descrição"}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Data">{dateBR(t.date)}</td>
                      <td data-label="Forma">{METHOD_LABEL[t.method]}</td>
                      <td data-label="Situação">
                        <button className="status-toggle" onClick={() => toggleStatus(t)} title="Clique para alterar">
                          <span className={`badge ${t.status === "PAID" ? "badge-success" : "badge-warning"}`}>
                            {t.status === "PAID" ? (t.type === "INCOME" ? "Recebido" : "Pago") : t.type === "INCOME" ? "A receber" : "A pagar"}
                          </span>
                        </button>
                      </td>
                      <td data-label="Valor" className={`num ${t.type === "INCOME" ? "amount-in" : "amount-out"}`}>
                        {t.type === "EXPENSE" ? "- " : "+ "}
                        {brl(t.amount)}
                      </td>
                      <td className="actions-cell">
                        <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => remove(t)} aria-label="Excluir">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-title">Resumo do mês</div>
          </div>
          <div className="card-body">
            {!summary ? (
              <PageLoader />
            ) : (
              <>
                <div className="divider-label">Recebido por forma de pagamento</div>
                {summary.byMethod.length === 0 ? (
                  <p className="muted small">Sem entradas recebidas</p>
                ) : (
                  <div className="bar-list">
                    {summary.byMethod.map((m) => (
                      <Bar key={m.method} label={METHOD_LABEL[m.method]} value={m.total} max={maxMethod} />
                    ))}
                  </div>
                )}

                <div className="divider-label">Entradas por categoria</div>
                {incomeCategories.length === 0 ? (
                  <p className="muted small">Sem entradas</p>
                ) : (
                  <div className="bar-list">
                    {incomeCategories.map((c) => (
                      <Bar key={c.categoryId} label={c.name} value={c.total} max={maxIncomeCat} />
                    ))}
                  </div>
                )}

                <div className="divider-label">Saídas por categoria</div>
                {expenseCategories.length === 0 ? (
                  <p className="muted small">Sem saídas</p>
                ) : (
                  <div className="bar-list">
                    {expenseCategories.map((c) => (
                      <Bar key={c.categoryId} label={c.name} value={c.total} max={maxExpenseCat} out />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {creating && (
        <Modal title="Novo lançamento" subtitle="Registre uma entrada ou saída" onClose={() => setCreating(false)}>
          <TransactionForm
            onCreated={() => {
              setCreating(false);
              load();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      )}
    </>
  );
}

function Bar({ label, value, max, out }: { label: string; value: number; max: number; out?: boolean }) {
  return (
    <div className="bar-row">
      <div className="top">
        <span>{label}</span>
        <strong>{brl(value)}</strong>
      </div>
      <div className={`bar ${out ? "out" : ""}`}>
        <i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
      </div>
    </div>
  );
}
