import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Baby, CalendarDays, ClipboardList, HeartPulse, MessageCircle, Pencil, Stethoscope, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ageLabel, dateBR, dateTimeBR, formatPhone, TEMPLATE_LABEL, whatsappLink } from "../format";
import { PatientForm, type PatientInput } from "../components/PatientForm";
import { Avatar, EmptyState, Modal, PageLoader, StatusBadge } from "../components/ui";
import { useToast } from "../components/toast";
import type { Consultation, ConsultationStatus, Patient, Template } from "../types";

type PatientWithHistory = Patient & {
  consultations: { id: string; template: Template; status: ConsultationStatus; createdAt: string; doctor: { name: string } }[];
};

export function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { session } = useAuth();
  const clinical = session!.user.role !== "SECRETARY";
  const [patient, setPatient] = useState<PatientWithHistory | null>(null);
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState<Template | null>(null);

  const load = useCallback(() => {
    api.get<PatientWithHistory>(`/patients/${id}`).then(setPatient);
  }, [id]);
  useEffect(load, [load]);

  async function save(data: PatientInput) {
    await api.put(`/patients/${id}`, data);
    setEditing(false);
    toast("Dados atualizados");
    load();
  }

  async function startConsultation(template: Template) {
    setStarting(template);
    try {
      const c = await api.post<Consultation>("/consultations", { patientId: id, template });
      navigate(`/consultas/${c.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setStarting(null);
    }
  }

  if (!patient) return <PageLoader />;

  return (
    <>
      <Link to="/pacientes" className="back-link" style={{ marginBottom: -8 }}>
        <ArrowLeft size={15} /> Pacientes
      </Link>

      <section className="card">
        <div className="card-body">
          <div className="profile">
            <Avatar name={patient.name} size="lg" />
            <div className="grow">
              <h1>{patient.name}</h1>
              <div className="meta-row" style={{ marginTop: 6 }}>
                <span>
                  <Baby size={15} /> {ageLabel(patient.birthDate)}
                </span>
                <span>
                  <CalendarDays size={15} /> {dateBR(patient.birthDate)}
                </span>
                <span>{patient.sex === "F" ? "Feminino" : "Masculino"}</span>
              </div>
            </div>
            <div className="btn-row">
              {clinical && (
                <>
                  <button className="btn btn-primary" disabled={!!starting} onClick={() => startConsultation("PUERICULTURA")}>
                    <Baby size={17} /> {starting === "PUERICULTURA" ? "Abrindo..." : "Puericultura"}
                  </button>
                  <button className="btn btn-secondary" disabled={!!starting} onClick={() => startConsultation("URGENCIA")}>
                    <Stethoscope size={17} /> {starting === "URGENCIA" ? "Abrindo..." : "Consulta geral"}
                  </button>
                </>
              )}
            </div>
          </div>
          {patient.allergies && (
            <div className="alert alert-danger">
              <TriangleAlert size={18} />
              <div>
                <strong>Alergias:</strong> {patient.allergies}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid-main-side">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <ClipboardList size={18} /> Histórico de consultas
              </div>
              <div className="card-subtitle">{patient.consultations.length} atendimento(s)</div>
            </div>
          </div>
          {patient.consultations.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="Nenhuma consulta registrada"
              text={clinical ? "Inicie a primeira consulta pelos botões acima." : undefined}
            />
          ) : (
            <div className="list">
              {patient.consultations.map((c) => {
                const content = (
                  <>
                    <div className={`stat-icon ${c.template === "PUERICULTURA" ? "tone-blue" : "tone-violet"}`} style={{ width: 36, height: 36 }}>
                      {c.template === "PUERICULTURA" ? <Baby size={17} /> : <Stethoscope size={17} />}
                    </div>
                    <div className="grow">
                      <strong>{TEMPLATE_LABEL[c.template]}</strong>
                      <small>
                        {dateTimeBR(c.createdAt)} · {c.doctor.name}
                      </small>
                    </div>
                    <StatusBadge status={c.status} />
                  </>
                );
                return clinical ? (
                  <Link key={c.id} to={`/consultas/${c.id}`} className="list-item">
                    {content}
                  </Link>
                ) : (
                  <div key={c.id} className="list-item">
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <div className="card-title">Dados cadastrais</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Editar
            </button>
          </div>
          <div className="card-body">
            <dl className="info-list">
              <div className="full">
                <dt>Responsável</dt>
                <dd>{patient.guardianName}</dd>
              </div>
              <div className="full">
                <dt>WhatsApp</dt>
                <dd>
                  <a href={whatsappLink(patient.guardianPhone, "")} target="_blank" rel="noreferrer" className="meta-row" style={{ color: "var(--whatsapp)" }}>
                    <span>
                      <MessageCircle size={15} /> {formatPhone(patient.guardianPhone)}
                    </span>
                  </a>
                </dd>
              </div>
              <div className="full">
                <dt>Alergias</dt>
                <dd>{patient.allergies || "Nenhuma informada"}</dd>
              </div>
              <div className="full">
                <dt>Observações</dt>
                <dd>{patient.notes || "Sem observações"}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      {editing && (
        <Modal title="Editar paciente" onClose={() => setEditing(false)}>
          <PatientForm initial={patient} onSubmit={save} onCancel={() => setEditing(false)} />
        </Modal>
      )}
    </>
  );
}
