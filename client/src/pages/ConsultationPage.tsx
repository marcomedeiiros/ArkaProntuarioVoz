import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  CloudUpload,
  FileText,
  Heart,
  LoaderCircle,
  MessageCircle,
  Mic,
  Pill,
  Receipt,
  RotateCcw,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import { api } from "../api";
import { ageLabel, brl, dateTimeBR, METHOD_LABEL, TEMPLATE_LABEL, whatsappLink } from "../format";
import { useServerTranscription } from "../useServerTranscription";
import { CopyButton } from "../components/CopyButton";
import { TransactionForm } from "../components/TransactionForm";
import { Avatar, EmptyState, PageLoader, StatusBadge } from "../components/ui";
import { useToast } from "../components/toast";
import type { Consultation, PrescriptionItem, Template } from "../types";

type SaveState = "saved" | "saving" | "dirty" | "error";
type Tab = "evolution" | "prescription" | "guide" | "payment";

const isPending = (text: string) => text.toUpperCase().includes("A DEFINIR");

function prescriptionText(items: PrescriptionItem[], notes: string | null): string {
  const meds = items.map((m, i) => `${i + 1}. ${m.medicamento}\n   ${m.posologia}, ${m.duracao}`).join("\n\n");
  return [meds, notes && `Orientações:\n${notes}`].filter(Boolean).join("\n\n");
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ConsultationPage() {
  const { id } = useParams();
  const toast = useToast();
  const [c, setC] = useState<Consultation | null>(null);
  const [transcript, setTranscript] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("evolution");
  const [elapsed, setElapsed] = useState(0);
  const lastSaved = useRef("");
  // Espelho síncrono da transcrição: o texto que chega do servidor e o autosave sempre usam o valor mais novo.
  const transcriptRef = useRef("");

  const changeTranscript = useCallback((next: string) => {
    transcriptRef.current = next;
    setTranscript(next);
  }, []);

  useEffect(() => {
    api.get<Consultation>(`/consultations/${id}`).then((data) => {
      setC(data);
      changeTranscript(data.transcript);
      lastSaved.current = data.transcript;
    });
  }, [id, changeTranscript]);

  const patch = useCallback(
    async (data: Partial<Record<string, unknown>>) => {
      const updated = await api.patch<Consultation>(`/consultations/${id}`, data);
      setC(updated);
      return updated;
    },
    [id],
  );

  const saveTranscript = useCallback(async () => {
    const text = transcriptRef.current;
    if (text === lastSaved.current) return;
    setSaveState("saving");
    try {
      await patch({ transcript: text });
      lastSaved.current = text;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [patch]);

  // Salva a transcrição automaticamente 1,5s após a última alteração.
  useEffect(() => {
    if (transcript === lastSaved.current) return;
    setSaveState("dirty");
    const t = setTimeout(saveTranscript, 1500);
    return () => clearTimeout(t);
  }, [transcript, saveTranscript]);

  // O servidor já anexou o trecho à transcrição salva; aqui fazemos a mesma junção na tela.
  // Se não havia edição pendente, a tela continua igual ao banco e não precisa salvar de novo.
  const speech = useServerTranscription(id, (text) => {
    const prev = transcriptRef.current;
    const next = prev ? `${prev} ${text}` : text;
    if (prev === lastSaved.current) lastSaved.current = next;
    changeTranscript(next);
  });

  // Nada fica guardado no navegador: se ainda há áudio ou texto não enviado ao servidor, avisa antes de sair.
  const unsent = saveState !== "saved" || speech.listening || speech.pending > 0;
  useEffect(() => {
    if (!unsent) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  useEffect(() => {
    if (!speech.listening) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [speech.listening]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await speech.finish(); // espera os últimos trechos da gravação virarem texto
      await saveTranscript();
      const updated = await api.post<Consultation>(`/consultations/${id}/generate`);
      setC(updated);
      setTab("evolution");
      toast("Documentos gerados. Revise antes de usar.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  /** Mostra o motivo quando o servidor recusa uma alteração (regras vivem no back-end). */
  const showError = (err: unknown) => toast((err as Error).message, "error");

  /** Alterações de campos da captura: o servidor valida e pode recusar. */
  const update = (data: Partial<Record<string, unknown>>) => patch(data).catch(showError);

  async function setStatus(action: "finalize" | "reopen") {
    try {
      setC(await api.post<Consultation>(`/consultations/${id}/${action}`));
      toast(action === "finalize" ? "Consulta finalizada" : "Consulta reaberta para edição");
    } catch (err) {
      showError(err);
    }
  }

  const saveField = (field: string) => async (value: string) => {
    try {
      await patch({ [field]: value });
      toast("Alteração salva");
    } catch (err) {
      showError(err);
    }
  };

  if (!c) return <PageLoader />;

  const finalized = c.status === "FINALIZED";
  const generated = Boolean(c.evolution);
  const patient = c.patient;
  const alerts = c.alerts ?? [];
  const prescription = c.prescription ?? [];

  return (
    <>
      <section className="card">
        <div className="consult-head">
          <Avatar name={patient.name} size="lg" />
          <div className="grow">
            <Link to={`/pacientes/${patient.id}`} className="back-link" style={{ marginBottom: 2 }}>
              <ArrowLeft size={14} /> Ficha do paciente
            </Link>
            <h1>{patient.name}</h1>
            <div className="meta-row" style={{ marginTop: 6 }}>
              <span>{ageLabel(patient.birthDate)}</span>
              <span>Resp.: {patient.guardianName}</span>
              <span>{dateTimeBR(c.createdAt)}</span>
              <StatusBadge status={c.status} />
              {patient.allergies && (
                <span className="badge badge-danger no-dot">
                  <TriangleAlert size={12} /> Alergia: {patient.allergies}
                </span>
              )}
            </div>
          </div>
          {generated && (
            <div className="btn-row">
              {finalized ? (
                <button className="btn btn-secondary" onClick={() => setStatus("reopen")}>
                  <RotateCcw size={16} /> Reabrir
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => setStatus("finalize")}>
                  <CircleCheck size={16} /> Finalizar consulta
                </button>
              )}
            </div>
          )}
        </div>
        <div className="stepper">
          <Step n={1} label="Captura" state={generated ? "done" : "current"} />
          <span className="step-line" />
          <Step n={2} label="Revisão" state={finalized ? "done" : generated ? "current" : "todo"} />
          <span className="step-line" />
          <Step n={3} label="Finalizada" state={finalized ? "done" : "todo"} />
        </div>
      </section>

      <div className="consult-grid">
        {/* Captura */}
        <section className="card capture-card">
          <div className="card-header">
            <div>
              <div className="card-title">
                <Mic size={18} /> Captura da consulta
              </div>
              <div className="card-subtitle">Grave ou cole a conversa da consulta</div>
            </div>
            <SaveIndicator state={saveState} />
          </div>
          <div className="card-body">
            <div className="form-grid keep-2-cols">
              <label className="field col-span-2">
                <span className="field-label">Tipo de consulta</span>
                <select
                  className="select"
                  value={c.template}
                  disabled={finalized}
                  onChange={(e) => update({ template: e.target.value as Template })}
                >
                  {Object.entries(TEMPLATE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Peso</span>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    defaultValue={c.weightKg ?? ""}
                    disabled={finalized}
                    onBlur={(e) => update({ weightKg: e.target.value ? Number(e.target.value) : null })}
                  />
                  <span className="input-suffix">kg</span>
                </div>
              </label>
              <label className="field">
                <span className="field-label">Estatura</span>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    defaultValue={c.heightCm ?? ""}
                    disabled={finalized}
                    onBlur={(e) => update({ heightCm: e.target.value ? Number(e.target.value) : null })}
                  />
                  <span className="input-suffix">cm</span>
                </div>
              </label>
            </div>

            {speech.supported ? (
              <div
                className={`recorder ${speech.listening ? "live" : ""}`}
                style={{ "--level": speech.level } as CSSProperties}
              >
                <button
                  className={`mic-btn ${speech.listening ? "live" : ""}`}
                  onClick={speech.listening ? speech.stop : speech.start}
                  disabled={finalized}
                  aria-label={speech.listening ? "Parar gravação" : "Iniciar gravação"}
                >
                  {speech.listening ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
                </button>
                <div className="status">
                  <strong>{speech.listening ? "Gravando..." : transcript ? "Continuar gravando" : "Iniciar gravação"}</strong>
                  <small>
                    {speech.listening
                      ? "Fale naturalmente. O texto aparece a cada pausa."
                      : "Transcrita no servidor da clínica, O áudio não é guardado"}
                  </small>
                </div>
                {speech.listening && (
                  <div className="rec-side">
                    <span className="timer">{formatElapsed(elapsed)}</span>
                    <span className="level-meter" aria-hidden="true" />
                  </div>
                )}
              </div>
            ) : (
              <div className="alert alert-warning">
                <TriangleAlert size={18} />
                <div>Este navegador não permite gravar áudio (é preciso um navegador atualizado e conexão HTTPS). Cole a transcrição abaixo.</div>
              </div>
            )}
            {speech.error && (
              <div className="alert alert-danger">
                <TriangleAlert size={18} />
                <div>{speech.error}</div>
              </div>
            )}

            <label className="field">
              <span className="field-label">Transcrição</span>
              <textarea
                className="textarea"
                rows={12}
                value={transcript}
                disabled={finalized}
                onChange={(e) => changeTranscript(e.target.value)}
                onBlur={saveTranscript}
                placeholder="A transcrição aparece aqui. Dica: verbalize os achados do exame físico e a conduta, com dose e intervalo dos medicamentos."
              />
            </label>
            {speech.pending > 0 && (
              <p className="interim" role="status">
                <LoaderCircle size={14} className="spin" /> Transcrevendo {speech.pending === 1 ? "o último trecho" : `${speech.pending} trechos`}...
              </p>
            )}

            {error && (
              <div className="form-error">
                <TriangleAlert size={16} /> {error}
              </div>
            )}
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={generate}
              disabled={generating || finalized || (transcript.trim().length < 40 && !speech.listening && speech.pending === 0)}
            >
              {generating ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
              {generating ? (speech.pending > 0 ? "Terminando a transcrição..." : "Gerando documentos...") : generated ? "Gerar novamente" : "Gerar prontuário, receita e guia"}
            </button>
          </div>
        </section>

        {/* Resultados */}
        <section className="card">
          {!generated ? (
            <EmptyState
              icon={Sparkles}
              title="Os documentos aparecem aqui"
              text="Depois de gravar, clique em Gerar a IA monta a evolução para o prontuário, a receita e o guia de orientações para os pais"
            />
          ) : (
            <>
              <div className="tabs">
                <TabButton tab="evolution" current={tab} onSelect={setTab} icon={FileText} label="Evolução" />
                <TabButton tab="prescription" current={tab} onSelect={setTab} icon={Pill} label="Receita" count={prescription.length} />
                <TabButton tab="guide" current={tab} onSelect={setTab} icon={Heart} label="Guia dos pais" />
                <TabButton tab="payment" current={tab} onSelect={setTab} icon={Receipt} label="Pagamento" count={c.transactions.length} />
              </div>

              <div className="card-body">
                {alerts.length > 0 && tab !== "payment" && (
                  <div className="alert alert-warning">
                    <TriangleAlert size={18} />
                    <div>
                      <h4>Revise antes de usar</h4>
                      <ul>
                        {alerts.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {tab === "evolution" && (
                  <>
                    <div className="toolbar">
                      <span className="hint">Cole no prontuário eletrônico (iClinic)</span>
                      <CopyButton text={c.evolution ?? ""} label="Copiar evolução" primary />
                    </div>
                    <EditableText value={c.evolution ?? ""} rows={18} disabled={finalized} onSave={saveField("evolution")} />
                  </>
                )}

                {tab === "prescription" && (
                  <>
                    <div className="toolbar">
                      <span className="hint">Transcreva na receita digital (Memed)</span>
                      <CopyButton text={prescriptionText(prescription, c.prescriptionNotes)} label="Copiar receita" primary />
                    </div>
                    {prescription.length === 0 ? (
                      <EmptyState icon={Pill} title="Nenhum medicamento prescrito" />
                    ) : (
                      <div className="rx-list">
                        {prescription.map((m, i) => (
                          <div key={i} className="rx-item">
                            <span className="n">{i + 1}</span>
                            <div>
                              <strong>{m.medicamento}</strong>
                              <div className="dose">
                                <span className={isPending(m.posologia) ? "pending" : ""}>{m.posologia}</span>
                                {" · "}
                                <span className={isPending(m.duracao) ? "pending" : ""}>{m.duracao}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className="field">
                      <span className="field-label">Orientações da receita</span>
                      <EditableText value={c.prescriptionNotes ?? ""} rows={4} disabled={finalized} onSave={saveField("prescriptionNotes")} />
                    </label>
                  </>
                )}

                {tab === "guide" && (
                  <>
                    <div className="toolbar">
                      <span className="hint">Para {patient.guardianName}</span>
                      <div className="btn-row">
                        <CopyButton text={c.parentGuide ?? ""} />
                        <a
                          className="btn btn-whatsapp btn-sm"
                          href={whatsappLink(patient.guardianPhone, c.parentGuide ?? "")}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle size={15} /> Enviar no WhatsApp
                        </a>
                      </div>
                    </div>
                    <EditableText value={c.parentGuide ?? ""} rows={18} disabled={finalized} onSave={saveField("parentGuide")} />
                  </>
                )}

                {tab === "payment" && (
                  <>
                    {c.transactions.map((t) => (
                      <div key={t.id} className="payment-row">
                        <div>
                          <strong>{brl(t.amount)}</strong>
                          <div className="muted small">
                            {METHOD_LABEL[t.method]} · {t.category.name}
                          </div>
                        </div>
                        <span className={`badge ${t.status === "PAID" ? "badge-success" : "badge-warning"}`}>
                          {t.status === "PAID" ? "Recebido" : "A receber"}
                        </span>
                      </div>
                    ))}
                    <div className="divider-label">{c.transactions.length ? "Novo pagamento" : "Registrar pagamento"}</div>
                    <TransactionForm
                      fixedType="INCOME"
                      patientId={patient.id}
                      consultationId={c.id}
                      defaultCategoryName={c.template === "PUERICULTURA" ? "Puericultura" : "Consulta particular"}
                      onCreated={(t) => setC({ ...c, transactions: [...c.transactions, t] })}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function Step({ n, label, state }: { n: number; label: string; state: "done" | "current" | "todo" }) {
  return (
    <span className={`step ${state === "todo" ? "" : state}`}>
      <span className="dot">{state === "done" ? <Check size={13} strokeWidth={3} /> : n}</span>
      {label}
    </span>
  );
}

function TabButton({
  tab,
  current,
  onSelect,
  icon: Icon,
  label,
  count,
}: {
  tab: Tab;
  current: Tab;
  onSelect: (t: Tab) => void;
  icon: typeof FileText;
  label: string;
  count?: number;
}) {
  return (
    <button className={`tab ${tab === current ? "active" : ""}`} onClick={() => onSelect(tab)}>
      <Icon size={16} /> {label}
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="save-state">
        <LoaderCircle size={13} className="spin" /> Salvando
      </span>
    );
  if (state === "dirty")
    return (
      <span className="save-state">
        <CloudUpload size={13} /> Alterações pendentes
      </span>
    );
  if (state === "error")
    return (
      <span className="save-state error">
        <TriangleAlert size={13} /> Erro ao salvar
      </span>
    );
  return (
    <span className="save-state">
      <Check size={13} /> Salvo
    </span>
  );
}

/** Textarea que mantém edição local e salva ao sair do campo. */
function EditableText({
  value,
  rows,
  disabled,
  onSave,
}: {
  value: string;
  rows: number;
  disabled: boolean;
  onSave: (value: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <textarea
      className="textarea"
      rows={rows}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
    />
  );
}
