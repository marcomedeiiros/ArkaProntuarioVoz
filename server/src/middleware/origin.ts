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
  if (origin !== undefined && origin !== allowed) throw new HttpError(403, "Origem da requisição não permitida");
  next();
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return "invalid"; // Referer malformado nunca é aceito como origem válida
  }
}
