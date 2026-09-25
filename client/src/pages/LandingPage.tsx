import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  Clock,
  EyeOff,
  FileText,
  Heart,
  Keyboard,
  Menu,
  MessageCircle,
  Mic,
  Pill,
  Puzzle,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TriangleAlert,
  Unplug,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import "../landing.css";

/* ------------------------------------------------------------------ */
/* Conteúdo                                                            */
/* ------------------------------------------------------------------ */

const PAINS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Keyboard,
    title: "Horas digitando evolução",
    text: "Anamnese e evolução digitadas durante ou depois da consulta roubam o fim do seu dia",
  },
  {
    icon: EyeOff,
    title: "Olho na tela, não na criança",
    text: "Enquanto digita, você perde o contato com a família e os sinais que só o olhar capta",
  },
  {
    icon: Unplug,
    title: "Sistemas que não conversam",
    text: "Prontuário, receita e WhatsApp em janelas separadas copia daqui, cola ali, retrabalho sempre",
  },
  {
    icon: TrendingDown,
    title: "Financeiro abandonado",
    text: "O módulo financeiro é tão complexo que ninguém lança nada, e o caixa do mês vira um mistério",
  },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Mic,
    title: "Grave a consulta",
    text: "Um clique e pronto converse normalmente com a família, pelo notebook ou pelo celular",
  },
  {
    icon: Sparkles,
    title: "A IA organiza tudo",
    text: "Em segundos, a conversa vira evolução estruturada no template de Puericultura ou Consulta geral",
  },
  {
    icon: CheckCheck,
    title: "Revise e envie",
    text: "Confira, cole no prontuário, transcreva a receita e mande o guia para os pais com um clique",
  },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Baby, title: "Feito para pediatria", text: "Templates de Puericultura e Consulta geral/Urgência pensados para a rotina do consultório" },
  { icon: TriangleAlert, title: "Nada de dose inventada", text: "Se a dose não foi dita, a IA marca como pendente e avisa você antes de qualquer envio" },
  { icon: CircleDollarSign, title: "Financeiro simples", text: "Registre o pagamento na própria consulta e veja o resumo do mês por forma e categoria" },
  { icon: Users, title: "Equipe com perfis", text: "Médica, secretária e administradora, cada uma vendo só o que precisa" },
  { icon: ShieldCheck, title: "Dados isolados por clínica", text: "Cada consultório acessa apenas os próprios pacientes, com login individual" },
  { icon: Puzzle, title: "Convive com o que você usa", text: "Não troca seu prontuário nem sua receita digital funciona ao lado deles" },
];

const FAQ = [
  {
    q: "Preciso trocar de sistema de prontuário?",
    a: "Não o prontuário por voz gera os textos e você cola no prontuário e na receita digital que já usa nada de migração",
  },
  {
    q: "A IA substitui a minha avaliação?",
    a: "Nunca tudo o que a IA gera é um rascunho para sua revisão pontos ambíguos ou doses não ditas aparecem destacados para você conferir",
  },
  {
    q: "Funciona em qual navegador?",
    a: "Em qualquer navegador atualizado (Chrome, Edge, Firefox ou Safari), no computador ou no celular a transcrição é feita no nosso próprio servidor: o áudio não vai para o Google nem para outras empresas, e não fica guardado",
  },
  {
    q: "E a privacidade dos pacientes?",
    a: "Os dados ficam separados por clínica e o acesso é por login individual recomendamos sempre pedir o consentimento da família antes de gravar",
  },
  {
    q: "Quanto tempo leva para começar?",
    a: "Você cria a conta em minutos se preferir, a implantação assistida cuida da configuração, dos templates e do treinamento da equipe",
  },
];

/* Fotos gratuitas do Unsplash (licença Unsplash: uso comercial livre), salvas em public/photos
   em dois tamanhos (-800 e -1400). Para trocar por fotos próprias, substitua os arquivos. */
const PHOTOS = {
  presence: {
    name: "presenca",
    alt: "Pediatra de jaleco examinando uma menina sentada no sofá do consultório",
  },
  exam: {
    name: "exame",
    alt: "Pediatra auscultando uma criança com o estetoscópio",
  },
  family: {
    name: "familia",
    alt: "Médico conversando com um menino e a mãe durante a consulta",
  },
  doctor: {
    name: "medica",
    alt: "Médica sorridente com estetoscópio no pescoço",
  },
};

// Autores (Unsplash): Bermix Studio (presenca, exame), Vitaly Gariev (familia), Siednji Leon (medica).

function Photo({ photo, sizes, className = "" }: { photo: { name: string; alt: string }; sizes: string; className?: string }) {
  const src = (w: number) => `/photos/${photo.name}-${w}.jpg`;
  return (
    <img
      className={className}
      src={src(800)}
      srcSet={[800, 1400].map((w) => `${src(w)} ${w}w`).join(", ")}
      sizes={sizes}
      alt={photo.alt}
      loading="lazy"
      decoding="async"
    />
  );
}

const TEMPLATE_CARDS = [
  {
    photo: PHOTOS.exam,
    tag: "Puericultura",
    title: "Marcos, amamentação e vacinas",
    text: "Seções de alimentação, sono, desenvolvimento e vacinação preenchidas a partir da conversa",
  },
  {
    photo: PHOTOS.family,
    tag: "Consulta geral",
    title: "Queixa, conduta e sinais de alarme",
    text: "Da história da doença à conduta, com os sinais de alarme que a família precisa saber",
  },
  {
    photo: PHOTOS.doctor,
    tag: "Guia dos pais",
    title: "Do jeito que você fala",
    text: "Orientações carinhosas no seu tom, prontas para enviar pelo WhatsApp depois da consulta",
  },
];

/* ------------------------------------------------------------------ */
/* Hooks de animação                                                   */
/* ------------------------------------------------------------------ */

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Adiciona .is-visible aos elementos [data-reveal] quando entram na tela. */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".lp [data-reveal]");
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    // Em navegador normal o observer dispara logo após observe(). Se não disparar (aba sem
    // renderização, alguns robôs), mostramos tudo para o conteúdo nunca ficar invisível.
    let fired = false;
    const fallback = setTimeout(() => !fired && els.forEach((el) => el.classList.add("is-visible")), 1500);
    const io = new IntersectionObserver(
      (entries) => {
        fired = true;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      clearTimeout(fallback);
      io.disconnect();
    };
  }, []);
}

/** Conta de 0 até o valor quando o número aparece na tela. */
function CountUp({ value, suffix = "", duration = 1400 }: { value: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return;
    let raf = 0;
    let fired = false;
    const fallback = setTimeout(() => !fired && setShown(value), 1500);
    const io = new IntersectionObserver(([entry]) => {
      fired = true;
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(ref.current);
    return () => {
      clearTimeout(fallback);
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref}>
      {shown}
      {suffix}
    </span>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <div data-reveal className={`lp-reveal ${className}`} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Marca                                                               */
/* ------------------------------------------------------------------ */

function BrandLogos({ size = "md" }: { size?: "md" | "sm" }) {
  return (
    <span className={`lp-brand ${size}`}>
      <img src="/brand/prontuario-por-voz.png" alt="Prontuário por Voz - Pediatria" className="lp-brand-main" />
      <span className="lp-brand-sep" aria-hidden="true" />
      <img src="/brand/arka-tecnologia.png" alt="Arka Tecnologia" className="lp-brand-arka" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Fundo de monitor cardíaco                                           */
/* ------------------------------------------------------------------ */

/** Traçado de ECG (onda P, complexo QRS e onda T) repetido na largura informada. */
function ecgPath(width: number, baseline: number, amp: number, beat = 260) {
  let d = `M0 ${baseline}`;
  for (let x = 0; x < width; x += beat) {
    const p = (dx: number, dy: number) => `L${(x + dx).toFixed(1)} ${(baseline - dy * amp).toFixed(1)}`;
    d += [
      p(beat * 0.18, 0),
      p(beat * 0.22, 0.12), // onda P
      p(beat * 0.26, 0),
      p(beat * 0.34, 0),
      p(beat * 0.36, -0.18), // Q
      p(beat * 0.4, 1), // R
      p(beat * 0.44, -0.35), // S
      p(beat * 0.47, 0),
      p(beat * 0.58, 0),
      p(beat * 0.64, 0.22), // onda T
      p(beat * 0.7, 0),
      p(beat, 0),
    ].join(" ");
  }
  return d;
}

/**
 * Linha plana com um batimento (P, QRS, T) centrado em cada posição de `centers`.
 * Usada entre os passos, com os batimentos no meio do caminho entre os ícones.
 */
function ecgSegment(width: number, baseline: number, amp: number, centers: number[], beatW = 150) {
  let d = `M0 ${baseline}`;
  for (const c of centers) {
    const x0 = c - beatW / 2;
    const p = (f: number, dy: number) => `L${(x0 + beatW * f).toFixed(1)} ${(baseline - dy * amp).toFixed(1)}`;
    d += " " + [
      p(0, 0),
      p(0.1, 0),
      p(0.17, 0.16), // onda P
      p(0.24, 0),
      p(0.38, 0),
      p(0.42, -0.22), // Q
      p(0.48, 1), // R
      p(0.54, -0.42), // S
      p(0.6, 0),
      p(0.7, 0),
      p(0.79, 0.26), // onda T
      p(0.88, 0),
      p(1, 0),
    ].join(" ");
  }
  return `${d} L${width} ${baseline}`;
}

/** Traçado de monitor ligando os três passos, com um pulso que percorre a linha. */
function StepsEcg() {
  const d = ecgSegment(1000, 40, 34, [250, 750]);
  return (
    <svg className="lp-steps-ecg" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} className="track" vectorEffect="non-scaling-stroke" />
      <path d={d} className="pulse" vectorEffect="non-scaling-stroke" pathLength={1000} />
    </svg>
  );
}

function EcgBackground() {
  const W = 1600;
  const lines = [
    { y: 250, amp: 90, cls: "main", beat: 320 },
    { y: 520, amp: 46, cls: "soft", beat: 240 },
  ];
  return (
    <svg className="lp-ecg" viewBox={`0 0 ${W} 700`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="ecg-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#03b9aa" stopOpacity="0" />
          <stop offset="0.15" stopColor="#03b9aa" stopOpacity="1" />
          <stop offset="0.85" stopColor="#03b9aa" stopOpacity="1" />
          <stop offset="1" stopColor="#03b9aa" stopOpacity="0" />
        </linearGradient>
        <filter id="ecg-glow" x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {lines.map((l) => {
        const d = ecgPath(W, l.y, l.amp, l.beat);
        return (
          <g key={l.cls} className={`lp-ecg-line ${l.cls}`}>
            <path d={d} className="track" stroke="url(#ecg-fade)" />
            <path d={d} className="pulse" stroke="url(#ecg-fade)" filter="url(#ecg-glow)" pathLength={1000} />
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Demonstração animada do hero                                        */
/* ------------------------------------------------------------------ */

const DEMO_LINES: { who: "Médica" | "Mãe"; text: string }[] = [
  { who: "Médica", text: "Oi, mãe! Como ele tem mamado?" },
  { who: "Mãe", text: "Só no peito, umas oito vezes por dia." },
  { who: "Médica", text: "Que bom! E já está firmando a cabecinha?" },
  { who: "Mãe", text: "Já sim, e abre um sorrisão quando a gente conversa." },
];

const DEMO_OUTPUT = [
  ["IDENTIFICAÇÃO", "lactente de 3 meses, acompanhado pela mãe."],
  ["ALIMENTAÇÃO", "aleitamento materno exclusivo, cerca de 8 mamadas/dia."],
  ["DESENVOLVIMENTO", "sustento cefálico e sorriso social presentes."],
  ["AVALIAÇÃO", "desenvolvimento adequado para a idade."],
];

const DEMO_TOTAL_TICKS = 18;

function HeroDemo() {
  const [tick, setTick] = useState(prefersReducedMotion() ? DEMO_TOTAL_TICKS - 4 : 0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t = setInterval(() => setTick((n) => (n + 1) % DEMO_TOTAL_TICKS), 750);
    return () => clearInterval(t);
  }, []);

  const lines = Math.min(tick, DEMO_LINES.length);
  const generating = tick === 5 || tick === 6;
  const outputs = Math.max(0, Math.min(tick - 6, DEMO_OUTPUT.length));
  const done = tick >= 11;
  const recording = tick <= 4;

  return (
    <div className="lp-demo" aria-hidden="true">
      <div className="lp-demo-window">
        <div className="lp-demo-bar">
          <i />
          <i />
          <i />
          <span>Consulta · João Pedro, 3 meses</span>
        </div>

        <div className="lp-demo-body">
          <div className={`lp-demo-rec ${recording ? "live" : ""}`}>
            <span className="lp-demo-mic">
              <Mic size={16} />
            </span>
            <div className="lp-wave">
              {Array.from({ length: 28 }).map((_, i) => (
                <b key={i} style={{ animationDelay: `${(i % 7) * 90}ms` }} />
              ))}
            </div>
            <span className="lp-demo-time">{recording ? `00:0${Math.min(tick * 2, 9)}` : "04:32"}</span>
          </div>

          <div className="lp-demo-transcript">
            {DEMO_LINES.slice(0, lines).map((l) => (
              <p key={l.text} className={l.who === "Médica" ? "doctor" : "parent"}>
                <b>{l.who}</b>
                {l.text}
              </p>
            ))}
            {lines === 0 && <p className="placeholder">Ouvindo a consulta...</p>}
          </div>

          <div className={`lp-demo-output ${generating ? "generating" : ""}`}>
            <div className="lp-demo-tabs">
              <b>
                <FileText size={13} /> Evolução
              </b>
              <span>
                <Pill size={13} /> Receita
              </span>
              <span>
                <Heart size={13} /> Guia dos pais
              </span>
            </div>
            {generating ? (
              <div className="lp-shimmer">
                <i />
                <i />
                <i />
              </div>
            ) : (
              <div className="lp-demo-sections">
                {DEMO_OUTPUT.slice(0, outputs).map(([k, v]) => (
                  <p key={k}>
                    <em>{k}:</em> {v}
                  </p>
                ))}
                {outputs === 0 && <p className="placeholder">Os documentos aparecem aqui.</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`lp-float lp-float-a ${done ? "show" : ""}`}>
        <span className="ic green">
          <Check size={14} strokeWidth={3} />
        </span>
        <div>
          <strong>Evolução pronta</strong>
          <small>gerada em segundos</small>
        </div>
      </div>
      <div className={`lp-float lp-float-b ${done ? "show" : ""}`}>
        <span className="ic wa">
          <MessageCircle size={14} />
        </span>
        <div>
          <strong>Guia enviado</strong>
          <small>para a mãe, no WhatsApp</small>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vitrine das entregas                                                */
/* ------------------------------------------------------------------ */

type Showcase = "record" | "rx" | "guide";

function OutputShowcase() {
  const [tab, setTab] = useState<Showcase>("record");
  const tabs: { key: Showcase; icon: LucideIcon; title: string; text: string }[] = [
    { key: "record", icon: FileText, title: "Evolução clínica", text: "Seções completas, prontas para colar no prontuário" },
    { key: "rx", icon: Pill, title: "Receita organizada", text: "Medicamento, posologia e duração para a receita digital" },
    { key: "guide", icon: Heart, title: "Guia para os pais", text: "Linguagem acolhedora, formatada para o WhatsApp" },
  ];

  return (
    <div className="lp-showcase">
      <div className="lp-showcase-tabs" role="tablist">
        {tabs.map(({ key, icon: Icon, title, text }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            <span className="ic">
              <Icon size={19} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="lp-showcase-stage" key={tab}>
        {tab === "record" && (
          <div className="lp-doc">
            <div className="lp-doc-head">
              <span>Evolução · Puericultura</span>
              <span className="lp-pill">Copiar para o prontuário</span>
            </div>
            {[
              ["IDENTIFICAÇÃO", "Lactente de 3 meses, acompanhado pela mãe"],
              ["ALIMENTAÇÃO", "Aleitamento materno exclusivo, em livre demanda, cerca de 8 mamadas ao dia"],
              ["SONO", "Sono tranquilo, despertares noturnos (2x) para mamar"],
              ["DESENVOLVIMENTO", "Sustento cefálico e sorriso social presentes, adequado para a idade"],
              ["VACINAÇÃO", "Vacinas dos 2 meses realizadas"],
              ["CONDUTA", "Manter aleitamento materno exclusivo, suplementação de vitamina D"],
            ].map(([k, v], i) => (
              <p key={k} style={{ animationDelay: `${i * 70}ms` }}>
                <em>{k}:</em> {v}
              </p>
            ))}
          </div>
        )}

        {tab === "rx" && (
          <div className="lp-doc">
            <div className="lp-doc-head">
              <span>Receita · Otite média aguda</span>
              <span className="lp-pill">Copiar para a receita</span>
            </div>
            <div className="lp-rx">
              <span className="n">1</span>
              <div>
                <strong>Amoxicilina 400 mg/5 mL, suspensão oral</strong>
                <small>5 mL por via oral, de 12 em 12 horas · 10 dias</small>
              </div>
            </div>
            <div className="lp-rx">
              <span className="n">2</span>
              <div>
                <strong>Paracetamol 200 mg/mL, gotas</strong>
                <small className="warn">
                  <TriangleAlert size={13} /> Dose não informada na consulta: A DEFINIR
                </small>
              </div>
            </div>
            <div className="lp-rx-note">
              <TriangleAlert size={15} /> A IA nunca inventa doses o que faltou fica marcado para você completar
            </div>
          </div>
        )}

        {tab === "guide" && (
          <div className="lp-phone">
            <div className="lp-phone-head">
              <span className="avatar">M</span>
              <div>
                <strong>Mariana, mãe do João</strong>
                <small>online</small>
              </div>
            </div>
            <div className="lp-phone-body">
              <div className="lp-bubble">
                <strong>Como foi a consulta do João hoje 💙</strong>
                <p>Ele está crescendo lindamente! 6,2 kg e desenvolvimento certinho para a idade.</p>
                <p>
                  <strong>Alimentação</strong>
                  <br />• Continue só com o peito, sempre que ele pedir.
                </p>
                <p>
                  <strong>Vitamina D ☀️</strong>
                  <br />• 2 gotinhas por dia, todos os dias.
                </p>
                <p>
                  <strong>Procure atendimento se</strong>
                  <br />• Febre de 38 °C ou mais
                  <br />• Recusar mamar
                </p>
                <span className="time">
                  10:42 <CheckCheck size={14} />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Calculadora                                                         */
/* ------------------------------------------------------------------ */

function RoiCalculator() {
  const [perDay, setPerDay] = useState(12);
  const [minutes, setMinutes] = useState(10);
  const [days, setDays] = useState(20);
  const hoursMonth = Math.round((perDay * minutes * days) / 60);
  const hoursDay = Math.round((perDay * minutes) / 6) / 10;

  const sliders = [
    { label: "Consultas por dia", value: perDay, set: setPerDay, min: 4, max: 30 },
    { label: "Minutos economizados por consulta", value: minutes, set: setMinutes, min: 3, max: 15 },
    { label: "Dias de atendimento no mês", value: days, set: setDays, min: 8, max: 26 },
  ];

  return (
    <div className="lp-roi">
      <div className="lp-roi-inputs">
        {sliders.map((s) => (
          <label key={s.label}>
            <span>
              {s.label} <strong>{s.value}</strong>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              value={s.value}
              onChange={(e) => s.set(Number(e.target.value))}
              style={{ "--p": `${((s.value - s.min) / (s.max - s.min)) * 100}%` } as React.CSSProperties}
            />
          </label>
        ))}
        <p className="lp-roi-note">Estimativa o ganho real depende do seu ritmo de atendimento</p>
      </div>
      <div className="lp-roi-result">
        <Clock size={26} />
        <span>Você ganha de volta</span>
        <strong key={hoursMonth}>{hoursMonth} h</strong>
        <span>por mês, cerca de {hoursDay} h por dia</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#como-funciona", label: "Como funciona" },
    { href: "#entregas", label: "Entregas" },
    { href: "#recursos", label: "Recursos" },
    { href: "#planos", label: "Planos" },
    { href: "#faq", label: "Dúvidas" },
  ];

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? "scrolled" : ""} ${menuOpen ? "menu-open" : ""}`}>
        <div className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-logo" onClick={() => setMenuOpen(false)} aria-label="Prontuário por Voz, início">
            <BrandLogos />
          </a>
          <nav className="lp-nav-links">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav-cta">
            <Link to="/login" className="lp-btn ghost">
              Entrar
            </Link>
            <Link to="/cadastro" className="lp-btn">
              Começar agora
            </Link>
          </div>
          <button className="lp-burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <div className="lp-mobile-menu">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className="lp-mobile-cta">
            <Link to="/login" className="lp-btn ghost">
              Entrar
            </Link>
            <Link to="/cadastro" className="lp-btn">
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-hero" id="top">
        <div className="lp-hero-bg" aria-hidden="true">
          <span className="blob b1" />
          <span className="blob b2" />
          <EcgBackground />
        </div>
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow lp-enter" style={{ "--d": "0ms" } as React.CSSProperties}>
              <span className="dot" /> IA para consultórios de pediatria
            </span>
            <h1 className="lp-enter" style={{ "--d": "80ms" } as React.CSSProperties}>
              Olhe para a criança
              <br />
              <span className="grad">A gente escreve o prontuário</span>
            </h1>
            <p className="lp-lead lp-enter" style={{ "--d": "160ms" } as React.CSSProperties}>
              Grave a consulta e receba em segundos a evolução clínica, a receita organizada e um guia carinhoso para os
              pais, pronto para o WhatsApp
            </p>
            <div className="lp-hero-cta lp-enter" style={{ "--d": "240ms" } as React.CSSProperties}>
              <Link to="/cadastro" className="lp-btn lg">
                Criar conta grátis <ArrowRight size={18} />
              </Link>
              <a href="#como-funciona" className="lp-btn lg ghost">
                Ver como funciona
              </a>
            </div>
            <ul className="lp-checks lp-enter" style={{ "--d": "320ms" } as React.CSSProperties}>
              <li>
                <Check size={16} /> Sem trocar seu prontuário
              </li>
              <li>
                <Check size={16} /> Templates de puericultura
              </li>
              <li>
                <Check size={16} /> Você revisa tudo
              </li>
            </ul>
          </div>
          <div className="lp-enter lp-hero-visual" style={{ "--d": "200ms" } as React.CSSProperties}>
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* Números */}
      <section className="lp-metrics">
        <div className="lp-wrap lp-metrics-grid">
          {[
            { value: 10, suffix: " min", label: "economizados por consulta*" },
            { value: 40, suffix: " h", label: "livres por mês*" },
            { value: 3, suffix: "", label: "documentos por gravação" },
            { value: 0, suffix: "", label: "linhas digitadas na consulta" },
          ].map((m, i) => (
            <Reveal key={m.label} delay={i * 80} className="lp-metric">
              <strong>
                <CountUp value={m.value} suffix={m.suffix} />
              </strong>
              <span>{m.label}</span>
            </Reveal>
          ))}
        </div>
        <p className="lp-wrap lp-metrics-note">* Estimativa com 12 atendimentos por dia e 20 dias de consultório</p>
      </section>

      {/* Dores */}
      <section className="lp-section">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">O problema</span>
            <h2>A consulta acaba, mas o trabalho continua</h2>
            <p>Os gargalos que mais escutamos de pediatras</p>
          </Reveal>
          <div className="lp-grid-4">
            {PAINS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 90} className="lp-card lp-pain">
                <span className="lp-ic red">
                  <Icon size={20} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Presença (foto) */}
      <section className="lp-section alt lp-presence-section">
        <div className="lp-wrap lp-presence">
          <Reveal className="lp-presence-media">
            <div className="lp-photo-frame">
              <Photo photo={PHOTOS.presence} sizes="(max-width: 1080px) 100vw, 560px" />
            </div>
            <div className="lp-photo-chip rec">
              <span className="dot" /> Gravando consulta · 04:32
            </div>
            <div className="lp-photo-chip ok">
              <span className="ic">
                <Check size={14} strokeWidth={3} />
              </span>
              <div>
                <strong>Prontuário gerado</strong>
                <small>pronto para revisar</small>
              </div>
            </div>
          </Reveal>
          <Reveal className="lp-presence-copy" delay={120}>
            <span className="lp-kicker">Mais presença, menos tela</span>
            <h2>A atenção volta para quem importa</h2>
            <p className="lp-presence-lead">
              Enquanto você examina e conversa com a família, o Prontuário por Voz escuta e organiza nada de interromper a
              consulta para digitar
            </p>
            <ul className="lp-bullets">
              <li>
                <span className="lp-ic small">
                  <Heart size={16} />
                </span>
                <div>
                  <strong>Contato visual durante toda a consulta</strong>
                  <p>A criança e os pais percebem que você está ali por inteiro</p>
                </div>
              </li>
              <li>
                <span className="lp-ic small">
                  <Mic size={16} />
                </span>
                <div>
                  <strong>Anamnese completa sem esforço</strong>
                  <p>Tudo o que foi dito vira texto, sem depender da memória no fim do dia</p>
                </div>
              </li>
              <li>
                <span className="lp-ic small">
                  <Clock size={16} />
                </span>
                <div>
                  <strong>Fim do expediente sem pilha de evoluções</strong>
                  <p>Cada consulta sai documentada antes da próxima começar</p>
                </div>
              </li>
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Como funciona */}
      <section className="lp-section" id="como-funciona">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">Como funciona</span>
            <h2>Três passos, zero digitação</h2>
            <p>Do “bom dia” ao guia no celular dos pais</p>
          </Reveal>
          <div className="lp-steps">
            <StepsEcg />
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 140} className="lp-step">
                <span className="lp-step-ic">
                  <Icon size={24} />
                  <span className="lp-step-n">{i + 1}</span>
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Templates (fotos) */}
      <section className="lp-section alt">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">Feito para a pediatria</span>
            <h2>Templates que falam a língua do seu consultório</h2>
            <p>Cada tipo de atendimento com a estrutura que você já usa</p>
          </Reveal>
          <div className="lp-grid-3">
            {TEMPLATE_CARDS.map((t, i) => (
              <Reveal key={t.tag} delay={i * 110} className="lp-photo-card">
                <div className="lp-photo-card-media">
                  <Photo photo={t.photo} sizes="(max-width: 860px) 100vw, 380px" />
                  <span className="lp-photo-tag">{t.tag}</span>
                </div>
                <div className="lp-photo-card-body">
                  <h3>{t.title}</h3>
                  <p>{t.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Entregas */}
      <section className="lp-section" id="entregas">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">Uma gravação, três entregas</span>
            <h2>Tudo pronto a partir da mesma conversa</h2>
            <p>Clique para ver cada documento</p>
          </Reveal>
          <Reveal delay={100}>
            <OutputShowcase />
          </Reveal>
        </div>
      </section>

      {/* ROI */}
      <section className="lp-section alt">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">Faça a conta</span>
            <h2>Quanto tempo você ganha de volta?</h2>
            <p>Ajuste com a sua agenda</p>
          </Reveal>
          <Reveal delay={100}>
            <RoiCalculator />
          </Reveal>
        </div>
      </section>

      {/* Recursos */}
      <section className="lp-section" id="recursos">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">Recursos</span>
            <h2>Tudo que o consultório precisa, nada que atrapalhe</h2>
          </Reveal>
          <div className="lp-grid-3">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={(i % 3) * 90} className="lp-card lp-feature">
                <span className="lp-ic">
                  <Icon size={20} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section className="lp-section alt" id="planos">
        <div className="lp-wrap">
          <Reveal className="lp-head">
            <span className="lp-kicker">Planos</span>
            <h2>Comece sozinha ou com a nossa equipe ao lado</h2>
            <p>A implantação é obrigatória e cobrada uma única vez</p>
          </Reveal>
          <div className="lp-plans">
            <Reveal className="lp-plan">
              <h3>Assinatura</h3>
              <p className="lp-plan-desc">Para começar a usar hoje</p>
              <p className="lp-price">
                R$ 249<small>/mês</small>
              </p>
              <ul>
                <li>Consultas ilimitadas</li>
                <li>Templates de Puericultura e Urgência</li>
                <li>Guia para os pais via WhatsApp</li>
                <li>Financeiro simplificado</li>
                <li>Médica + secretária</li>
              </ul>
              <Link to="/cadastro" className="lp-btn block">
                Começar agora
              </Link>
            </Reveal>
            <Reveal className="lp-plan" delay={100}>
              <h3>Essencial</h3>
              <p className="lp-plan-desc">Configuração guiada</p>
              <p className="lp-price">
                R$ 3.000<small> em até 3x</small>
              </p>
              <ul>
                <li>Configuração completa da conta</li>
                <li>2 templates personalizados</li>
                <li>Organização do financeiro</li>
                <li>1 hora de treinamento</li>
                <li>15 dias de suporte</li>
              </ul>
              <a href="#contato" className="lp-btn block ghost">
                Falar com a equipe
              </a>
            </Reveal>
            <Reveal className="lp-plan featured" delay={200}>
              <span className="lp-badge">Mais completo</span>
              <h3>Premium</h3>
              <p className="lp-plan-desc">Para a clínica inteira</p>
              <p className="lp-price">
                R$ 4.500<small> em até 3x</small>
              </p>
              <ul>
                <li>Setup multi-dispositivo</li>
                <li>Até 5 templates avançados</li>
                <li>Guia visual personalizado para os pais</li>
                <li>Treinamento da médica e da secretária</li>
                <li>90 dias de suporte prioritário</li>
              </ul>
              <a href="#contato" className="lp-btn block white">
                Falar com a equipe
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-section" id="faq">
        <div className="lp-wrap lp-narrow">
          <Reveal className="lp-head">
            <span className="lp-kicker">Dúvidas</span>
            <h2>Perguntas frequentes</h2>
          </Reveal>
          <div className="lp-faq">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 60}>
                <div className={`lp-faq-item ${openFaq === i ? "open" : ""}`}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                    {item.q}
                    <ChevronDown size={20} />
                  </button>
                  <div className="lp-faq-answer">
                    <div>
                      <p>{item.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="lp-final" id="contato">
        <div className="lp-final-bg" aria-hidden="true">
          <span className="ring r1" />
          <span className="ring r2" />
        </div>
        <Reveal className="lp-wrap lp-final-inner">
          <h2>Veja funcionando em 2 minutos</h2>
          <p>Simule uma consulta pediátrica e veja o prontuário e as orientações nascendo na hora</p>
          <div className="lp-hero-cta center">
            <Link to="/cadastro" className="lp-btn lg white">
              Criar conta grátis <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="lp-btn lg glass">
              Já tenho conta
            </Link>
          </div>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div>
            <span className="lp-logo">
              <BrandLogos size="sm" />
            </span>
            <p>Documentação clínica por voz para consultórios de pediatria</p>
          </div>
          <div>
            <h4>Produto</h4>
            <a href="#como-funciona">Como funciona</a>
            <a href="#entregas">Entregas</a>
            <a href="#planos">Planos</a>
          </div>
          <div>
            <h4>Conta</h4>
            <Link to="/login">Entrar</Link>
            <Link to="/cadastro">Criar conta</Link>
          </div>
        </div>
        <div className="lp-wrap lp-footer-bottom">
          <span>© {new Date().getFullYear()} Prontuário por Voz · Arka Tecnologia</span>
          <span>O conteúdo gerado por IA é um rascunho e deve ser revisado pela profissional responsável</span>          
        </div>
      </footer>
    </div>
  );
}
