import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Plus, Search, TriangleAlert, Users } from "lucide-react";
import { api } from "../api";
import { ageLabel, dateBR, formatPhone } from "../format";
import { PatientForm, type PatientInput } from "../components/PatientForm";
import { Avatar, EmptyState, Modal, PageHeader, PageLoader } from "../components/ui";
import { useToast } from "../components/toast";
import type { Patient } from "../types";

export function PatientsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get<Patient[]>(`/patients?q=${encodeURIComponent(query)}`).then(setPatients);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function create(data: PatientInput) {
    const patient = await api.post<Patient>("/patients", data);
    toast("Paciente cadastrado");
    navigate(`/pacientes/${patient.id}`);
  }

  return (
    <>
      <PageHeader
        title="Pacientes"
        subtitle="Selecione um paciente para ver o histórico ou iniciar uma consulta"
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={17} /> Novo paciente
          </button>
        }
      />

      <section className="card">
        <div className="card-header">
          <div className="input-group" style={{ flex: 1, maxWidth: 420 }}>
            <Search size={17} />
            <input
              className="input"
              placeholder="Buscar por criança ou responsável"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {patients && <span className="muted small">{patients.length} paciente(s)</span>}
        </div>

        {!patients ? (
          <PageLoader />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query ? "Nenhum resultado" : "Nenhum paciente cadastrado"}
            text={query ? "Tente buscar por outro nome." : "Cadastre o primeiro paciente para começar a atender."}
            action={
              !query && (
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <Plus size={17} /> Novo paciente
                </button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Nascimento</th>
                  <th>Responsável</th>
                  <th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/pacientes/${p.id}`)}>
                    <td className="primary-cell">
                      <div className="cell-main">
                        <Avatar name={p.name} />
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {ageLabel(p.birthDate)} · {p.sex === "F" ? "Feminino" : "Masculino"}
                          </small>
                        </div>
                        {p.allergies && (
                          <span className="badge badge-danger no-dot" title={`Alergias: ${p.allergies}`}>
                            <TriangleAlert size={12} /> Alergia
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Nascimento">{dateBR(p.birthDate)}</td>
                    <td data-label="Responsável">{p.guardianName}</td>
                    <td data-label="WhatsApp">
                      <span className="meta-row">
                        <span>
                          <Phone size={13} /> {formatPhone(p.guardianPhone)}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <Modal title="Novo paciente" subtitle="Dados da criança e do responsável" onClose={() => setCreating(false)}>
          <PatientForm onSubmit={create} onCancel={() => setCreating(false)} />
        </Modal>
      )}
    </>
  );
}
