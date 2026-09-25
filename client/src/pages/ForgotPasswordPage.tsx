import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle, MailCheck, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { AuthLayout } from "../components/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      {sent ? (
        <div className="auth-form" style={{ maxWidth: "none" }}>
          <div className="auth-icon">
            <MailCheck size={26} />
          </div>
          <div>
            <h1>Confira seu e-mail</h1>
            <p className="subtitle" style={{ marginTop: 6 }}>
              Se <strong>{email}</strong> tiver uma conta, enviamos um link para criar uma nova senha. Ele vale por 30 minutos
              e só pode ser usado uma vez.
            </p>
          </div>
          <p className="field-hint">Não chegou? Veja a caixa de spam ou tente de novo em alguns minutos.</p>
          <Link to="/login" className="btn btn-primary btn-lg btn-block">
            Voltar para o login
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} style={{ maxWidth: "none" }}>
          <div>
            <h1>Esqueci a senha</h1>
            <p className="subtitle" style={{ marginTop: 6 }}>
              Informe o e-mail da sua conta vamos enviar um link para você criar uma senha nova
            </p>
          </div>
          <label className="field">
            <span className="field-label">E-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && (
            <div className="form-error">
              <TriangleAlert size={16} /> {error}
            </div>
          )}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy && <LoaderCircle size={18} className="spin" />}
            {busy ? "Enviando..." : "Enviar link"}
          </button>
          <p className="switch">
            Lembrou a senha? <Link to="/login">Entrar</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
