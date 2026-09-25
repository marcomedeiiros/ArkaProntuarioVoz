import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "./toast";

export function CopyButton({ text, label = "Copiar", primary }: { text: string; label?: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast("Copiado para a área de transferência");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : "btn-secondary"}`} onClick={copy} disabled={!text}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Copiado" : label}
    </button>
  );
}
