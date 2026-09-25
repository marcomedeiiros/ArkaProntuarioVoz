/** Logo "Prontuário por Voz" | "Arka Tecnologia". Use tone="light" sobre fundos escuros. */
export function BrandLogos({ tone = "dark", size = "md" }: { tone?: "dark" | "light"; size?: "sm" | "md" | "lg" }) {
  const suffix = tone === "light" ? "-claro" : "";
  return (
    <span className={`brand-logos ${size} ${tone}`}>
      <img src={`/brand/prontuario-por-voz${suffix}.png`} alt="Prontuário por Voz - Pediatria" className="brand-main" />
      <span className="brand-sep" aria-hidden="true" />
      <img src={`/brand/arka-tecnologia${suffix}.png`} alt="Arka Tecnologia" className="brand-arka" />
    </span>
  );
}
