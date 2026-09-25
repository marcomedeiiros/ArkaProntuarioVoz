import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useAuth } from "../auth";
import { AuthLayout, PasswordInput } from "../components/AuthLayout";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  // Aviso vindo da tela de redefinir senha ("senha alterada, entre de novo").
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password, remember);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} style={{ maxWidth: "none" }}>
        <div>
          <h1>Entrar</h1>
          <p className="subtitle" style={{ marginTop: 6 }}>
            Acesse o consultório com seu e-mail e senha
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
        <label className="field">
          <span className="field-label">Senha</span>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </label>
        <div className="auth-options">
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Lembrar de mim</span>
          </label>
          <Link to="/esqueci-senha" className="auth-link">
            Esqueci a senha
          </Link>
        </div>
        {remember && (
          <p className="field-hint" style={{ marginTop: -8 }}>
            Você continua conectado neste aparelho por até 14 dias não marque em computadores compartilhados
          </p>
        )}
        {notice && !error && (
          <div className="form-success">
            <CircleCheck size={16} /> {notice}
          </div>
        )}
        {error && (
          <div className="form-error">
            <TriangleAlert size={16} /> {error}
          </div>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy && <LoaderCircle size={18} className="spin" />}
          {busy ? "Entrando..." : "Entrar"}
        </button>
        <p className="switch">
          Ainda não tem conta? <Link to="/cadastro">Criar conta da clínica</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
