import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CircleDollarSign, ClipboardList, Hourglass, Stethoscope, UserPlus, Wallet } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { brl, capitalize, dateTimeBR, TEMPLATE_LABEL } from "../format";
import { Avatar, EmptyState, StatCard, StatusBadge } from "../components/ui";
import type { DashboardData } from "../types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function DashboardPage() {
  const { session } = useAuth();
  const clinical = session!.user.role !== "SECRETARY";
  const [data, setData] = useState<DashboardData | null>(null);

  // Todos os números vêm calculados do servidor (/api/dashboard).
  useEffect(() => {
    api.get<DashboardData>("/dashboard").then(setData);
  }, []);

  const summary = data?.finance ?? null;
  const list = data?.clinical?.recent ?? [];
  const toReview = data?.clinical?.pending ?? [];
  const todayCount = data?.clinical?.todayCount ?? 0;
  const pendingCount = data?.clinical?.pendingCount ?? 0;
  const firstName = session!.user.name.replace(/^(Dra?\.)\s+/i, "").split(" ")[0];
  const todayLabel = capitalize(new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));

  return (
    <>
      <section className="welcome">
        <div>
          <h1>
            {greeting()}, {firstName}
          </h1>
          <p>{todayLabel}</p>
        </div>
        <div className="btn-row">
          {clinical ? (
            <Link to="/pacientes" className="btn btn-white btn-lg">
              <Stethoscope size={18} /> Nova consulta
            </Link>
          ) : (
            <Link to="/pacientes" className="btn btn-white btn-lg">
              <UserPlus size={18} /> Pacientes
            </Link>
          )}
          <Link to="/financeiro" className="btn btn-glass btn-lg">
            <Wallet size={18} /> Financeiro
          </Link>
        </div>
      </section>

      <div className="stats-grid">
        {clinical && (
          <>
            <StatCard icon={CalendarDays} label="Consultas hoje" value={todayCount} tone="blue" />
            <StatCard
              icon={Hourglass}
              label="Pendentes de revisão"
              value={pendingCount}
              hint="Rascunhos e geradas pela IA"
              tone="amber"
            />
          </>
        )}
        <StatCard
          icon={CircleDollarSign}
          label="Receita do mês"
          value={summary ? brl(summary.income) : "..."}
          tone="green"
        />
        <StatCard
          icon={Wallet}
          label="A receber"
          value={summary ? brl(summary.pendingIncome) : "..."}
          hint="Lançamentos pendentes"
          tone="violet"
        />
      </div>

      {clinical && (
        <div className="grid-2">
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <Hourglass size={18} /> Aguardando você
                </div>
                <div className="card-subtitle">Consultas que ainda não foram finalizadas</div>
              </div>
            </div>
            {toReview.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Tudo em dia" text="Nenhuma consulta pendente de revisão" />
            ) : (
              <div className="list">
                {toReview.slice(0, 6).map((c) => (
                  <Link key={c.id} to={`/consultas/${c.id}`} className="list-item">
                    <Avatar name={c.patient.name} size="sm" />
                    <div className="grow">
                      <strong>{c.patient.name}</strong>
                      <small>{TEMPLATE_LABEL[c.template]}</small>
                    </div>
                    <div className="end">
                      <StatusBadge status={c.status} />
                      <small>{dateTimeBR(c.createdAt)}</small>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">
                  <ClipboardList size={18} /> Consultas recentes
                </div>
                <div className="card-subtitle">Últimos atendimentos da clínica</div>
              </div>
              <Link to="/consultas" className="btn btn-ghost btn-sm">
                Ver todas
              </Link>
            </div>
            {list.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="Nenhuma consulta ainda"
                text="Abra o cadastro de um paciente para iniciar a primeira consulta"
                action={
                  <Link to="/pacientes" className="btn btn-primary">
                    Ir para pacientes
                  </Link>
                }
              />
            ) : (
              <div className="list">
                {list.slice(0, 6).map((c) => (
                  <Link key={c.id} to={`/consultas/${c.id}`} className="list-item">
                    <Avatar name={c.patient.name} size="sm" />
                    <div className="grow">
                      <strong>{c.patient.name}</strong>
                      <small>
                        {TEMPLATE_LABEL[c.template]} · {c.doctor.name}
                      </small>
                    </div>
                    <div className="end">
                      <StatusBadge status={c.status} />
                      <small>{dateTimeBR(c.createdAt)}</small>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
