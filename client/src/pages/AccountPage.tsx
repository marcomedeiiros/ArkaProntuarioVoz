import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";
import { ROLE_LABEL } from "../format";
import { PasswordInput } from "../components/AuthLayout";
import { Avatar, FormError, PageHeader } from "../components/ui";
import { useToast } from "../components/toast";

export function AccountPage() {
  const { session, changePassword, logoutEverywhere } = useAuth();
  const toast = useToast();
  const { user, clinic } = session!;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("A confirmação não confere com a nova senha");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Senha alterada. Os outros aparelhos foram desconectados.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if (!confirm_("Encerrar a sessão em todos os aparelhos, inclusive neste?")) return;
    setSigningOut(true);
    try {
      await logoutEverywhere();
    } catch (err) {
      toast((err as Error).message, "error");
      setSigningOut(false);
    }
  }

  return (
    <>
      <PageHeader title="Minha conta" subtitle="Seus dados de acesso e a segurança da sua sessão" />

      <div className="grid-main-side">
        <section className="card">
          <div className="card-header">
            <div className="card-title">
              <KeyRound size={18} /> Trocar senha
            </div>
          </div>
          <form className="card-body" onSubmit={submit}>
            <label className="field">
              <span className="field-label">Senha atual</span>
              <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" />
            </label>
            <label className="field">
              <span className="field-label">Nova senha</span>
              <PasswordInput value={next} onChange={setNext} minLength={8} autoComplete="new-password" />
              <span className="field-hint">Mínimo de 8 caracteres os outros aparelhos serão desconectados</span>
            </label>
            <label className="field">
              <span className="field-label">Confirme a nova senha</span>
              <PasswordInput value={confirm} onChange={setConfirm} minLength={8} autoComplete="new-password" />
            </label>
            <FormError message={error} />
            <div className="btn-row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" disabled={busy}>
                {busy && <LoaderCircle size={16} className="spin" />}
                Salvar nova senha
              </button>
            </div>
          </form>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <section className="card">
            <div className="card-body">
              <div className="profile">
                <Avatar name={user.name} size="lg" />
                <div className="grow">
                  <h2 style={{ fontSize: "1.1rem" }}>{user.name}</h2>
                  <p className="muted small">{user.email}</p>
                  <p className="muted small">
                    {user.platformAdmin ? "Administração da Arka" : `${ROLE_LABEL[user.role]}, ${clinic?.name ?? ""}`}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div className="card-title">
                <MonitorSmartphone size={18} /> Sessões
              </div>
            </div>
            <div className="card-body">
              <div className="alert alert-info">
                <ShieldCheck size={18} />
                <div>
                  Sua sessão dura até 8 horas e fica guardada de forma protegida no navegador Esqueceu o sistema aberto
                  em outro computador? Encerre todas as sessões
                </div>
              </div>
              <button className="btn btn-danger-ghost" onClick={signOutEverywhere} disabled={signingOut}>
                {signingOut ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}
                Sair de todos os aparelhos
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// `confirm` já é o nome do estado de confirmação da senha acima.
const confirm_ = (message: string) => window.confirm(message);
