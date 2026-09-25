import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";
import { clearSessionCookie, SESSION_COOKIE, verifySession } from "../lib/session";
import type { Actor } from "../use-cases/policy";

/**
 * Lê a sessão do cookie httpOnly e carrega o usuário do banco. Nunca confia no token além do id:
 * - usuário desativado perde o acesso na hora;
 * - perfil é sempre o atual do banco;
 * - tokens de uma versão de sessão antiga (saiu de todos os dispositivos, trocou a senha) são recusados.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || !token) throw new HttpError(401, "Não autenticado");

  const claims = verifySession(token);
  if (!claims) {
    clearSessionCookie(res);
    throw new HttpError(401, "Sessão expirada, faça login novamente");
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, clinicId: true, role: true, active: true, tokenVersion: true },
  });
  if (!user || !user.active) {
    clearSessionCookie(res);
    throw new HttpError(401, "Acesso desativado fale com a administração da clínica");
  }
  if (user.tokenVersion !== claims.ver) {
    clearSessionCookie(res);
    throw new HttpError(401, "Sua sessão foi encerrada faça login novamente");
  }

  req.auth = { userId: user.id, clinicId: user.clinicId, role: user.role };
  next();
}

/** Retorna o usuário autenticado; use apenas em rotas atrás de requireAuth. */
export function auth(req: Request): Actor {
  if (!req.auth) throw new HttpError(401, "Não autenticado");
  return req.auth;
}
