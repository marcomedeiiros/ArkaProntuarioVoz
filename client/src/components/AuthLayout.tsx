import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Eye, EyeOff, Heart, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { BrandLogos } from "./BrandLogos";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <img
          className="auth-photo"
          src="/photos/doutora-1400.jpg"
          srcSet="/photos/doutora-800.jpg 800w, /photos/doutora-1400.jpg 1400w"
          sizes="50vw"
          alt="Médica de jaleco e estetoscópio sentada à mesa do consultório"
        />
        <div className="auth-overlay" aria-hidden="true" />
        <div className="brand">
          <BrandLogos tone="light" size="lg" />
        </div>
        <div className="auth-photo-chip">
          <span className="ic">
            <Check size={14} strokeWidth={3} />
          </span>
          <div>
            <strong>Prontuário gerado</strong>
            <small>enquanto você atendia</small>
          </div>
        </div>
        <div className="auth-copy">
          <h2>Menos tela, mais criança</h2>
          <ul>
            <li>
              <Mic size={18} />
              <span>Grave a consulta sem digitar nada</span>
            </li>
            <li>
              <Sparkles size={18} />
              <span>Evolução, receita e guia para os pais gerados em segundos.</span>
            </li>
            <li>
              <Heart size={18} />
              <span>Orientações acolhedoras prontas para o WhatsApp</span>
            </li>
            <li>
              <ShieldCheck size={18} />
              <span>Você revisa tudo antes de usar nenhuma dose é inventada</span>
            </li>
          </ul>
        </div>
        <footer>Feito para consultórios de pediatria pela Arka Tecnologia</footer>
      </aside>
      <main className="auth-panel">
        <div className="auth-form">
          <Link to="/" className="auth-home">
            <ArrowLeft size={15} /> Voltar ao site
          </Link>
          {/* O painel da marca some em telas estreitas; a logo aparece aqui no lugar. */}
          <div className="auth-mobile-brand">
            <BrandLogos />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function PasswordInput({
  value,
  onChange,
  minLength,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  minLength?: number;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        className="input"
        type={show ? "text" : "password"}
        value={value}
        minLength={minLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
