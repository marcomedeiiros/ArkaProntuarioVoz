import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Stethoscope, UserPlus } from "lucide-react";
import { api } from "../api";
import { useAuth, useCan } from "../auth";
import { brl, capitalize, TEMPLATE_LABEL } from "../format";
import { PageLoader } from "../components/ui";
import type { ConsultationStatus, DashboardData } from "../types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** "hoje, 11:00", "ontem, 14:00" ou "22/09, 09:00": o que importa numa fila é quando foi. */
function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `hoje, ${time}`;
  if (days === 1) return `ontem, ${time}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

/** O que falta fazer em cada etapa, dito do ponto de vista de quem atende. */
const NEXT_STEP: Record<ConsultationStatus, string> = {
  DRAFT: "Falta gerar os documentos",
  GENERATED: "Revisar o que a IA escreveu",
  FINALIZED: "Finalizada",
};

export function DashboardPage() {
  const { session } = useAuth();
  const can = useCan();
  const clinical = can.consultations;
  const [data, setData] = useState<DashboardData | null>(null);

  // Todos os números vêm calculados do servidor (/api/dashboard).
  useEffect(() => {
    api.get<DashboardData>("/dashboard").then(setData);
  }, []);

  if (!data) return <PageLoader />;

  const finance = data.finance;
  const queue = data.clinical?.pending ?? [];
  const recent = (data.clinical?.recent ?? []).filter((c) => c.status === "FINALIZED");
  const firstName = session!.user.name.replace(/^(Dra?\.)\s+/i, "").split(" ")[0];
  const today = capitalize(new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));

  return (
    <div className="desk">
      <header className="desk-head">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p>{today}</p>
        </div>
        {can.patients && (
        <Link to="/pacientes" className="btn btn-primary btn-lg">
          {clinical ? <Stethoscope size={18} /> : <UserPlus size={18} />}
          {clinical ? "Nova consulta" : "Pacientes"}
        </Link>
        )}
      </header>

      <div className="desk-body">
        {clinical && (
          <main className="desk-main">
            <section className="queue" aria-labelledby="queue-title">
              <h2 id="queue-title">
                Para revisar <span className="queue-count">{data.clinical!.pendingCount}</span>
              </h2>
              {queue.length === 0 ? (
                <p className="queue-empty">
                  Nada esperando por você para começar, abra a ficha de um paciente e inicie a consulta
                </p>
              ) : (
                <ol className="queue-list">
                  {queue.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <Link to={`/consultas/${c.id}`} className={`queue-row is-${c.status.toLowerCase()}`}>
                        <span className="queue-who">
                          <strong>{c.patient.name}</strong>
                          <span>
                            {TEMPLATE_LABEL[c.template]}. {NEXT_STEP[c.status]}
                          </span>
                        </span>
                        <time dateTime={c.createdAt}>{when(c.createdAt)}</time>
                        <ChevronRight size={18} aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {recent.length > 0 && (
              <section className="recent" aria-labelledby="recent-title">
                <h2 id="recent-title">Finalizadas recentemente</h2>
                <ul>
                  {recent.slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <Link to={`/consultas/${c.id}`}>
                        <span>{c.patient.name}</span>
                        <span className="recent-meta">{TEMPLATE_LABEL[c.template]}</span>
                        <time dateTime={c.createdAt}>{when(c.createdAt)}</time>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/consultas" className="text-link">
                  Ver todas as consultas
                </Link>
              </section>
            )}
          </main>
        )}

        <aside className="ledger" aria-label="Resumo">
          {clinical && (
            <section>
              <h2>Hoje</h2>
              <dl>
                <div>
                  <dt>Consultas</dt>
                  <dd>{data.clinical!.todayCount}</dd>
                </div>
                <div>
                  <dt>Esperando revisão</dt>
                  <dd>{data.clinical!.pendingCount}</dd>
                </div>
              </dl>
            </section>
          )}
          {finance && (
          <section>
            <h2>{capitalize(new Date().toLocaleDateString("pt-BR", { month: "long" }))}</h2>
            <dl>
              <div>
                <dt>Recebido</dt>
                <dd>{brl(finance.income)}</dd>
              </div>
              <div>
                <dt>A receber</dt>
                <dd className={finance.pendingIncome > 0 ? "is-due" : undefined}>{brl(finance.pendingIncome)}</dd>
              </div>
            </dl>
            <Link to="/financeiro" className="text-link">
              Abrir financeiro
            </Link>
          </section>
          )}
        </aside>
      </div>
    </div>
  );
}
