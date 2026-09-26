import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const message = (text: string) => ({ error: text });

/** Tentativas de login por IP: bloqueia força bruta de senha. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitas tentativas de login aguarde 15 minutos e tente novamente"),
});

/** Criação de contas por IP. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitas contas criadas a partir desta rede tente mais tarde"),
});

/** Geração por IA por usuário: controla custo e abuso. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.auth?.actor.userId ?? "anon",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Limite de gerações por hora atingido tente novamente mais tarde"),
});

/** Trechos de áudio por usuário: ~20 s cada, 720/h cobre uma hora de gravação contínua com folga. */
export const transcriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 720,
  keyGenerator: (req) => req.auth?.actor.userId ?? "anon",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Limite de transcrição por hora atingido tente novamente mais tarde"),
});

/** Troca de senha por usuário: impede adivinhar a senha atual por tentativa e erro. */
export const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.auth?.actor.userId ?? "anon",
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitas tentativas de troca de senha Aguarde 15 minutos"),
});

/** "Esqueci a senha" por IP: teto geral, impede disparar e-mails para muitos endereços. */
export const forgotPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitos pedidos de redefinição aguarde 15 minutos"),
});

/** "Esqueci a senha" por IP e e-mail: impede lotar a caixa de uma pessoa. */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}|${String(req.body?.email ?? "").trim().toLowerCase().slice(0, 254)}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitos pedidos de redefinição aguarde 15 minutos"),
});

/** Tentativas de usar um link de redefinição por IP (o token tem 256 bits; aqui é contra abuso). */
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitas tentativas aguarde 15 minutos"),
});

/** Limite geral da API por IP. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: message("Muitas requisições aguarde um instante"),
});
