import { Router } from "express";
import { auth, requireAuth } from "../middleware/auth";
import {
  forgotPasswordIpLimiter,
  forgotPasswordLimiter,
  loginLimiter,
  passwordLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from "../middleware/rate-limit";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie, verifySession } from "../lib/session";
import {
  changePassword,
  getSession,
  login,
  logoutEverywhere,
  registerClinic,
  requestPasswordReset,
  resetPassword,
} from "../use-cases/auth";

export const authRouter = Router();

authRouter.post("/register", registerLimiter, async (req, res) => {
  const { principal, session } = await registerClinic(req.body);
  setSessionCookie(res, principal);
  res.status(201).json(session);
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { principal, session, remember } = await login(req.body);
  setSessionCookie(res, principal, remember);
  res.json(session);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await getSession(auth(req)));
});

/** Sai deste aparelho. */
authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

/** Sai de todos os aparelhos (invalida todos os tokens desta pessoa). */
authRouter.post("/logout-all", requireAuth, async (req, res) => {
  await logoutEverywhere(auth(req));
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.post("/change-password", requireAuth, passwordLimiter, async (req, res) => {
  const { principal, session } = await changePassword(auth(req), req.body);
  // Mantém a escolha de "lembrar de mim" da sessão atual.
  setSessionCookie(res, principal, verifySession(req.cookies?.[SESSION_COOKIE])?.rem ?? false);
  res.json(session);
});

/** Sempre 204, exista ou não o e-mail (não revela quem tem conta). */
authRouter.post("/forgot-password", forgotPasswordIpLimiter, forgotPasswordLimiter, async (req, res) => {
  await requestPasswordReset(req.body);
  res.status(204).end();
});

/** Usa o link do e-mail. A pessoa entra de novo com a senha nova. */
authRouter.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  await resetPassword(req.body);
  clearSessionCookie(res);
  res.status(204).end();
});
