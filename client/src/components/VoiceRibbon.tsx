import { useEffect, useRef, useState } from "react";

const BARS = 56;
const STEP_MS = 90;
const flat = () => new Array<number>(BARS).fill(0);

/**
 * Faixa da voz: cada barra é uma leitura real do nível do microfone, a mais nova à direita.
 * Só se mexe enquanto grava (é resposta à ação de quem fala); parada, é uma linha reta.
 */
export function VoiceRibbon({ level, live }: { level: number; live: boolean }) {
  const [bars, setBars] = useState(flat);
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    if (!live) {
      setBars(flat());
      return;
    }
    const t = setInterval(() => setBars((prev) => [...prev.slice(1), levelRef.current]), STEP_MS);
    return () => clearInterval(t);
  }, [live]);

  const w = 5;
  const gap = 3;
  const h = 44;
  return (
    <svg
      className={`voice-ribbon ${live ? "is-live" : ""}`}
      viewBox={`0 0 ${BARS * (w + gap) - gap} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bars.map((v, i) => {
        // Curva suave: fala baixa ainda aparece, grito não estoura.
        const size = Math.max(3, Math.round(Math.sqrt(Math.min(1, v)) * (h - 4)));
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={(h - size) / 2}
            width={w}
            height={size}
            rx={w / 2}
            opacity={live ? 0.35 + 0.65 * (i / (BARS - 1)) : 1}
          />
        );
      })}
    </svg>
  );
}
