import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../env";

/*
 * Criptografia de segredos guardados no banco (ex.: chave da Anthropic cadastrada no painel da Arka).
 * AES-256-GCM: sigilo e detecção de adulteração. A chave vem de SETTINGS_ENCRYPTION_KEY; sem ela,
 * é derivada do JWT_SECRET (HKDF). Nesse caso, trocar o JWT_SECRET exige cadastrar a chave de novo.
 * Quem lê o banco (backup, dump, vazamento) não consegue usar o segredo sem o .env do servidor.
 */
const VERSION = "v1";

function key(): Buffer {
  const base = env.SETTINGS_ENCRYPTION_KEY ?? env.JWT_SECRET;
  return Buffer.from(hkdfSync("sha256", base, "prontuario-por-voz", "platform-settings", 32));
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Devolve null se não der para abrir (chave do servidor trocada ou valor adulterado). */
export function decryptSecret(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
