import type { NextFunction, Request, Response } from "express";
import { env } from "../env";
import { HttpError } from "../lib/http-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defesa contra CSRF somada ao SameSite=Strict do cookie: requisições que alteram dados
 * só são aceitas se vierem do próprio site. Navegadores sempre enviam Origin (ou Referer)
 * nesses casos; ferramentas sem navegador (curl, scripts) não carregam o cookie de sessão.
 */
export function requireSameOrigin(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const allowed = new URL(env.CLIENT_URL).origin;
  const origin = req.get("origin") ?? originOf(req.get("referer"));
  if (origin !== undefined && origin !== allowed && !isLocalDevOrigin(origin)) {
    throw new HttpError(403, "Origem da requisição não permitida");
  }
  next();
}

/**
 * Só em desenvolvimento: o site local pode estar em qualquer porta de localhost (ex.: o Vite
 * pula para a 5174 quando a 5173 está ocupada). Em produção, apenas o CLIENT_URL vale.
 */
function isLocalDevOrigin(origin: string) {
  if (env.NODE_ENV !== "development") return false;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return "invalid"; // Referer malformado nunca é aceito como origem válida
  }
}
