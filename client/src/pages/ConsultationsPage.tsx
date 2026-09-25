import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Stethoscope } from "lucide-react";
import { api } from "../api";
import { dateTimeBR, TEMPLATE_LABEL } from "../format";
import { Avatar, EmptyState, PageHeader, PageLoader, StatusBadge } from "../components/ui";
import type { ConsultationCounts, ConsultationListItem, ConsultationStatus } from "../types";

const FILTERS: { key: ConsultationStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "DRAFT", label: "Rascunhos" },
  { key: "GENERATED", label: "Em revisão" },
  { key: "FINALIZED", label: "Finalizadas" },
];

export function ConsultationsPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState<ConsultationListItem[] | null>(null);
  const [counts, setCounts] = useState<ConsultationCounts>({ ALL: 0, DRAFT: 0, GENERATED: 0, FINALIZED: 0 });
  const [filter, setFilter] = useState<ConsultationStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get<ConsultationCounts>("/consultations/counts").then(setCounts);
  }, []);

  // Filtro e busca são feitos no servidor.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    if (query.trim()) params.set("q", query.trim());
    const t = setTimeout(() => {
      api.get<ConsultationListItem[]>(`/consultations?${params}`).then(setVisible);
    }, 250);
    return () => clearTimeout(t);
  }, [filter, query]);

  return (
    <>
      <PageHeader
        title="Consultas"
        subtitle="Acompanhe os atendimentos e finalize as revisões pendentes"
        actions={
          <Link className="btn btn-primary" to="/pacientes">
            <Stethoscope size={17} /> Nova consulta
          </Link>
        }
      />

      <section className="card">
        <div className="tabs">
          {FILTERS.map((f) => (
            <button key={f.key} className={`tab ${filter === f.key ? "active" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="card-header plain" style={{ paddingBottom: 16 }}>
          <div className="input-group" style={{ flex: 1, maxWidth: 380 }}>
            <Search size={17} />
            <input className="input" placeholder="Buscar paciente" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {!visible ? (
          <PageLoader />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="Nenhuma consulta encontrada"
            text={counts.ALL === 0 ? "Para iniciar uma consulta, abra o cadastro do paciente" : "Ajuste o filtro ou a busca"}
          />
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Tipo</th>
                  <th>Profissional</th>
                  <th>Data</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/consultas/${c.id}`)}>
                    <td className="primary-cell">
                      <div className="cell-main">
                        <Avatar name={c.patient.name} size="sm" />
                        <strong>{c.patient.name}</strong>
                      </div>
                    </td>
                    <td data-label="Tipo">{TEMPLATE_LABEL[c.template]}</td>
                    <td data-label="Profissional">{c.doctor.name}</td>
                    <td data-label="Data">{dateTimeBR(c.createdAt)}</td>
                    <td data-label="Status">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
