import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Hourglass, LoaderCircle, TriangleAlert } from "lucide-react";
import { useAuth } from "../auth";
import { AuthLayout, PasswordInput } from "../components/AuthLayout";

export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ clinicName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout>
        <div className="auth-form" style={{ maxWidth: "none" }}>
          <div className="auth-icon">
            <Hourglass size={26} />
          </div>
          <div>
            <h1>Cadastro enviado</h1>
            <p className="subtitle" style={{ marginTop: 6 }}>
              A Arka vai analisar o cadastro de <strong>{form.clinicName}</strong> assim que for liberado, você entra com{" "}
              <strong>{form.email}</strong> e a senha que acabou de criar
            </p>
          </div>
          <Link to="/login" className="btn btn-primary btn-lg btn-block">
            Ir para o login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} style={{ maxWidth: "none" }}>
        <div>
          <h1>Criar conta</h1>
          <p className="subtitle" style={{ marginTop: 6 }}>
            Você será a administradora da clínica depois que a Arka liberar o cadastro, você convida a equipe
          </p>
        </div>
        <label className="field">
          <span className="field-label">Nome da clínica ou consultório</span>
          <input className="input" value={form.clinicName} onChange={set("clinicName")} required autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Seu nome</span>
          <input className="input" autoComplete="name" value={form.name} onChange={set("name")} required />
        </label>
        <label className="field">
          <span className="field-label">E-mail</span>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} required />
        </label>
        <label className="field">
          <span className="field-label">Senha</span>
          <PasswordInput
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            minLength={8}
            autoComplete="new-password"
          />
          <span className="field-hint">Mínimo de 8 caracteres</span>
        </label>
        {error && (
          <div className="form-error">
            <TriangleAlert size={16} /> {error}
          </div>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy && <LoaderCircle size={18} className="spin" />}
          {busy ? "Criando conta..." : "Criar conta"}
        </button>
        <p className="switch">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
