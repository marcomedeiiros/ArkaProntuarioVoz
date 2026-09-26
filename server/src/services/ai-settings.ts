import Anthropic from "@anthropic-ai/sdk";
import { anthropicKeyLooksInvalid, env } from "../env";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";
import { decryptSecret, encryptSecret } from "../lib/secrets";

/*
 * Chave da Anthropic usada na geração dos documentos. Ordem: a cadastrada no painel da Arka
 * (criptografada no banco) e, se não houver, a do server/.env. A chave inteira nunca volta para
 * o navegador: o painel só vê os 4 últimos caracteres.
 */
const SETTING_KEY = "anthropic_api_key";

let cached: { key: string | null; source: "painel" | "env" | null; unreadable: boolean } | null = null;

async function load() {
  if (cached) return cached;
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY } });
  const fromPanel = row ? decryptSecret(row.value) : null;
  if (fromPanel) cached = { key: fromPanel, source: "painel", unreadable: false };
  else if (!anthropicKeyLooksInvalid(env.ANTHROPIC_API_KEY)) cached = { key: env.ANTHROPIC_API_KEY, source: "env", unreadable: !!row };
  else cached = { key: null, source: null, unreadable: !!row };
  return cached;
}

export async function getAnthropicClient() {
  const { key } = await load();
  if (!key) {
    throw new HttpError(503, "A IA não está configurada. A Arka precisa cadastrar a chave da Anthropic em Configurações.");
  }
  return new Anthropic({ apiKey: key });
}

/** O que o painel pode ver: se há chave, de onde vem e o final dela. Nunca a chave. */
export async function aiKeyStatus() {
  const state = await load();
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY }, select: { updatedAt: true } });
  return {
    configured: !!state.key,
    source: state.source,
    last4: state.key ? state.key.slice(-4) : null,
    updatedAt: state.source === "painel" ? (row?.updatedAt ?? null) : null,
    // Havia uma chave no painel, mas ela não abre mais (o segredo do servidor mudou): precisa cadastrar de novo.
    needsReentry: state.unreadable,
  };
}

/** Confere a chave com a própria Anthropic (lista modelos: não gasta tokens). */
export async function verifyAnthropicKey(key: string) {
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(400, "A Anthropic recusou esta chave. Confira se copiou a chave inteira.");
    if (err instanceof Anthropic.PermissionDeniedError) throw new HttpError(400, "Esta chave não tem permissão para usar a API.");
    if (err instanceof Anthropic.APIError) throw new HttpError(502, "Não foi possível falar com a Anthropic agora. Tente de novo em instantes.");
    throw new HttpError(502, "Não foi possível falar com a Anthropic agora. Tente de novo em instantes.");
  }
}

export async function saveAnthropicKey(key: string) {
  const value = encryptSecret(key);
  await prisma.platformSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
  cached = null;
}

export async function removeAnthropicKey() {
  await prisma.platformSetting.deleteMany({ where: { key: SETTING_KEY } });
  cached = null;
}
