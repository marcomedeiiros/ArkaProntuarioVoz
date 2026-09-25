import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env";

/** Nome do cookie de sessão. O JavaScript da página não consegue lê-lo (httpOnly). */
export const SESSION_COOKIE = "pv_session";

/** Sem "lembrar de mim": um turno de consultório, e o cookie some ao fechar o navegador. */
const SESSION_HOURS = 8;
/** Com "lembrar de mim": continua conectado neste aparelho por até 14 dias. */
export const REMEMBER_DAYS = 14;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;

const cookieOptions: CookieOptions = {
  httpOnly: true, // inacessível a scripts: um XSS não consegue roubar a sessão
  sameSite: "strict", // o navegador não envia o cookie em requisições vindas de outros sites
  secure: env.NODE_ENV === "production", // só HTTPS em produção (localhost em HTTP no desenvolvimento)
  path: "/api",
};

export interface SessionClaims {
  sub: string; // id do usuário
  ver: number; // User.tokenVersion no momento do login
  rem: boolean; // "lembrar de mim": preservado quando a sessão é renovada (ex.: troca de senha)
}

export function signSession(user: { id: string; tokenVersion: number }, remember = false): string {
  const claims: SessionClaims = { sub: user.id, ver: user.tokenVersion, rem: remember };
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: remember ? `${REMEMBER_DAYS}d` : `${SESSION_HOURS}h` });
}

export function verifySession(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") return null;
    return { sub: payload.sub, ver: payload.ver, rem: payload.rem === true };
  } catch {
    return null;
  }
}

/**
 * Sem "lembrar de mim" o cookie é de sessão (sem data de validade: o navegador apaga ao fechar)
 * e o token vale no máximo 8 h. Com "lembrar de mim", cookie e token duram 14 dias.
 * Nos dois casos, sair de todos os aparelhos, trocar a senha ou ser desativado derruba na hora.
 */
export function setSessionCookie(res: Response, user: { id: string; tokenVersion: number }, remember = false) {
  res.cookie(SESSION_COOKIE, signSession(user, remember), {
    ...cookieOptions,
    ...(remember && { maxAge: REMEMBER_MS }),
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
