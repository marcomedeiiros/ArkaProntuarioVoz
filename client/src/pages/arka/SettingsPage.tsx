import { useEffect, useState, type FormEvent } from "react";
import { CircleCheck, KeyRound, LoaderCircle, TriangleAlert } from "lucide-react";
import { api } from "../../api";
import { dateTimeBR } from "../../format";
import { PageHeader, PageLoader } from "../../components/ui";
import { PasswordInput } from "../../components/AuthLayout";
import { useToast } from "../../components/toast";

interface AiStatus {
  configured: boolean;
  source: "painel" | "env" | null;
  last4: string | null;
  updatedAt: string | null;
  needsReentry: boolean;
}

export function SettingsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AiStatus>("/platform/settings/ai").then(setStatus);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      setStatus(await api.put<AiStatus>("/platform/settings/ai", { key }));
      setKey(""); // a chave sai da tela e da memória do formulário assim que é salva
      toast("Chave conferida com a Anthropic e salva");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      await api.post("/platform/settings/ai/test");
      toast("Conexão com a Anthropic funcionando");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Remover a chave do painel? Se não houver chave no .env do servidor, a geração de prontuários para de funcionar.")) return;
    setBusy("remove");
    try {
      setStatus(await api.delete<AiStatus>("/platform/settings/ai"));
      toast("Chave removida do painel");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (!status) return <PageLoader />;

  return (
    <>
      <PageHeader title="Configurações" subtitle="Ajustes que valem para todo o Prontuário por Voz" />

      <section className="card settings-block">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <KeyRound size={18} /> Inteligência artificial
            </h2>
            <p className="card-subtitle">Chave da Anthropic usada para gerar evolução, receita e guia dos pais</p>
          </div>
        </div>
        <div className="card-body settings-body">
          {status.configured ? (
            <p className="settings-status is-ok">
              <CircleCheck size={18} />
              <span>
                Em uso: chave terminada em <strong className="key-tail">{status.last4}</strong>
                {status.source === "painel"
                  ? `, cadastrada aqui${status.updatedAt ? ` em ${dateTimeBR(status.updatedAt)}` : ""}.`
                  : ", vinda do arquivo .env do servidor."}
              </span>
            </p>
          ) : (
            <p className="settings-status is-off">
              <TriangleAlert size={18} />
              <span>Nenhuma chave configurada a geração de prontuários não funciona até você cadastrar uma</span>
            </p>
          )}
          {status.needsReentry && (
            <p className="settings-status is-off">
              <TriangleAlert size={18} />
              <span>A chave salva aqui não pôde ser lida (o segredo do servidor mudou). Cadastre a chave de novo.</span>
            </p>
          )}

          <form className="settings-form" onSubmit={save}>
            <label className="field">
              <span className="field-label">{status.source === "painel" ? "Trocar a chave" : "Cadastrar chave"}</span>
              <PasswordInput value={key} onChange={setKey} autoComplete="off" />
              <span className="field-hint">
                Crie em console.anthropic.com, na área API Keys começa com sk-ant- antes de salvar, conferimos com a Anthropic, e
                a chave fica guardada criptografada: depois disso ninguém a vê inteira, nem aqui
              </span>
            </label>
            {error && (
              <div className="form-error">
                <TriangleAlert size={16} /> {error}
              </div>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" disabled={!key.trim() || busy !== null}>
                {busy === "save" && <LoaderCircle size={16} className="spin" />}
                {busy === "save" ? "Conferindo com a Anthropic..." : "Salvar chave"}
              </button>
              {status.configured && (
                <button type="button" className="btn btn-secondary" onClick={test} disabled={busy !== null}>
                  {busy === "test" && <LoaderCircle size={16} className="spin" />}
                  Testar conexão
                </button>
              )}
              {status.source === "painel" && (
                <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy !== null}>
                  Remover chave do painel
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
