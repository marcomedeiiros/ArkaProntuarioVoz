import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";
import { clearSessionCookie, SESSION_COOKIE, verifySession } from "../lib/session";
import { assertClinicCanUse, permissionsFor } from "../lib/permissions";
import type { Actor, PlatformActor } from "../use-cases/policy";

/** Quem está logado: uma conta de clínica ou uma conta da Arka (nunca as duas coisas). */
export type Principal = { kind: "clinic"; actor: Actor } | { kind: "platform"; actor: PlatformActor };

/**
 * Lê a sessão do cookie httpOnly e carrega o usuário do banco. Nunca confia no token além do id:
 * - usuário desativado perde o acesso na hora;
 * - clínica suspensa (ou ainda não liberada) perde o acesso na hora;
 * - cargo e permissões são sempre os atuais do banco;
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
    select: {
      id: true,
      clinicId: true,
      role: true,
      active: true,
      tokenVersion: true,
      platformAdmin: true,
      clinic: { select: { status: true, statusReason: true } },
    },
  });
  if (!user || !user.active) {
    clearSessionCookie(res);
    throw new HttpError(401, "Acesso desativado. Fale com a administração da clínica.");
  }
  if (user.tokenVersion !== claims.ver) {
    clearSessionCookie(res);
    throw new HttpError(401, "Sua sessão foi encerrada. Faça login novamente.");
  }

  if (user.platformAdmin) {
    req.auth = { kind: "platform", actor: { userId: user.id } };
    return next();
  }
  if (!user.clinicId || !user.clinic) {
    clearSessionCookie(res);
    throw new HttpError(401, "Conta sem clínica");
  }
  try {
    assertClinicCanUse(user.clinic);
  } catch (err) {
    clearSessionCookie(res);
    throw err;
  }
  req.auth = {
    kind: "clinic",
    actor: {
      userId: user.id,
      clinicId: user.clinicId,
      role: user.role,
      permissions: await permissionsFor(user.clinicId, user.role),
    },
  };
  next();
}

/** Conta de clínica logada. A conta da Arka não acessa dados de clínicas. */
export function auth(req: Request): Actor {
  if (!req.auth) throw new HttpError(401, "Não autenticado");
  if (req.auth.kind !== "clinic") throw new HttpError(403, "A conta da Arka não acessa dados das clínicas");
  return req.auth.actor;
}

/** Conta da Arka logada (área de liberação, módulos e configurações). */
export function platformAuth(req: Request): PlatformActor {
  if (!req.auth) throw new HttpError(401, "Não autenticado");
  if (req.auth.kind !== "platform") throw new HttpError(403, "Área exclusiva da administração da Arka");
  return req.auth.actor;
}

/** Qualquer conta logada (sessão, troca de senha, sair). */
export function anyAuth(req: Request): { userId: string } {
  if (!req.auth) throw new HttpError(401, "Não autenticado");
  return { userId: req.auth.actor.userId };
}
