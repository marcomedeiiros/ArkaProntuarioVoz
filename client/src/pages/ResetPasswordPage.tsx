import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, LoaderCircle, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { AuthLayout, PasswordInput } from "../components/AuthLayout";

/** O token vem no fragmento (#token=...): o navegador nunca o envia a servidores nem o grava em logs. */
const readTokenFromHash = () => new URLSearchParams(window.location.hash.slice(1)).get("token");

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [token] = useState(readTokenFromHash);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Tira o token da barra de endereço e do histórico assim que ele é lido.
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("As senhas não conferem");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      // O servidor já encerrou todas as sessões: se havia alguém conectado aqui, sai também.
      if (session) await logout();
      navigate("/login", { replace: true, state: { notice: "Senha alterada. Entre com a senha nova." } });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <div className="auth-form" style={{ maxWidth: "none" }}>
          <div>
            <h1>Link inválido</h1>
            <p className="subtitle" style={{ marginTop: 6 }}>
              Abra o link completo que chegou no seu e-mail ou peça um novo.
            </p>
          </div>
          <Link to="/esqueci-senha" className="btn btn-primary btn-lg btn-block">
            Pedir novo link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} style={{ maxWidth: "none" }}>
        <div className="auth-icon">
          <KeyRound size={26} />
        </div>
        <div>
          <h1>Criar nova senha</h1>
          <p className="subtitle" style={{ marginTop: 6 }}>
            Depois de salvar, você será desconectado de todos os aparelhos e entra de novo com a senha nova.
          </p>
        </div>
        <label className="field">
          <span className="field-label">Nova senha</span>
          <PasswordInput value={password} onChange={setPassword} minLength={8} autoComplete="new-password" />
          <span className="field-hint">Mínimo de 8 caracteres. Prefira uma frase longa que você não usa em outro lugar.</span>
        </label>
        <label className="field">
          <span className="field-label">Confirme a nova senha</span>
          <PasswordInput value={confirm} onChange={setConfirm} minLength={8} autoComplete="new-password" />
        </label>
        {error && (
          <div className="form-error">
            <TriangleAlert size={16} /> {error}
            {error.includes("expirou") && (
              <>
                {" "}
                <Link to="/esqueci-senha">Pedir novo link</Link>
              </>
            )}
          </div>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy && <LoaderCircle size={18} className="spin" />}
          {busy ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </AuthLayout>
  );
}
