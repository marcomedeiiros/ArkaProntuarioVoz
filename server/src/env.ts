import "dotenv/config";
import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16, "JWT_SECRET precisa ter pelo menos 16 caracteres"),
    PORT: z.coerce.number().default(3333),
    CLIENT_URL: z.string().default("http://localhost:5173"),
    ANTHROPIC_API_KEY: z.string().trim().default(""),
    // Endereço público do front-end, usado nos links enviados por e-mail (ex.: redefinir a senha).
    APP_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
    // E-mail (SMTP). Sem SMTP_HOST em desenvolvimento, as mensagens vão para server/.mail-outbox.
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().default("Prontuário por Voz <nao-responda@localhost>"),
    ),
    // Transcrição local (Whisper). O turbo quantizado em q8 equilibra precisão e velocidade em CPU.
    WHISPER_MODEL: z.string().default("onnx-community/whisper-large-v3-turbo"),
    WHISPER_DTYPE: z.enum(["fp32", "fp16", "q8", "int8", "uint8", "q4", "q4f16", "bnb4"]).default("q8"),
    // 1 = nunca baixa nada da internet (o modelo já precisa estar em server/.models).
    WHISPER_OFFLINE: z
      .enum(["0", "1", "true", "false"])
      .default("0")
      .transform((v) => v === "1" || v === "true"),
  })
  .superRefine((env, ctx) => {
    // Em produção, recusa subir com o segredo de exemplo ou um segredo curto.
    if (env.NODE_ENV === "production" && isWeakSecret(env.JWT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "Em produção, use um JWT_SECRET aleatório com pelo menos 32 caracteres",
      });
    }
  });

/** Chave vazia ou o texto de exemplo ("sk-ant-..."): a geração por IA não vai funcionar. */
export function anthropicKeyLooksInvalid(key: string) {
  return key.length < 40 || key.includes("...") || !key.startsWith("sk-ant-");
}

function isWeakSecret(secret: string) {
  return secret.length < 32 || /troque|example|exemplo|changeme|secret|segredo/i.test(secret);
}

export const env = EnvSchema.parse(process.env);

if (env.NODE_ENV === "development" && isWeakSecret(env.JWT_SECRET)) {
  console.warn("[aviso] JWT_SECRET fraco ou de exemplo. Rode `npm --prefix server run setup:env` para gerar um forte.");
}
if (env.NODE_ENV === "production" && !env.SMTP_HOST) {
  console.warn("[aviso] SMTP_HOST não configurado: os e-mails de redefinição de senha não serão enviados.");
}
if (env.NODE_ENV !== "test" && anthropicKeyLooksInvalid(env.ANTHROPIC_API_KEY)) {
  console.warn(
    "[aviso] ANTHROPIC_API_KEY ausente ou de exemplo: a geração do prontuário vai falhar. " +
      "Rode `npm --prefix server run setup:env -- --anthropic-key` para colar a sua chave.",
  );
}
