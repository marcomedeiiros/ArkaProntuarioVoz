import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";
import { prisma } from "../lib/prisma";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: err.issues[0]?.message ?? "Dados inválidos",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  // Banco fora do ar ou recusando o login: mensagem clara na tela, diagnóstico (sem segredos) no terminal.
  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error(`[banco] ${dbHint(err.message)}`);
    // Sem isso o Prisma fica preso na falha até reiniciar a API; assim, reconecta quando o banco voltar.
    void prisma.$disconnect().catch(() => {});
    return res.status(503).json({ error: "Banco de dados indisponível no momento. Tente de novo em instantes." });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Registro não encontrado" });
    if (err.code === "P2002") return res.status(409).json({ error: "Registro já existe" });
  }
  // Erros do body-parser do Express (JSON malformado ou grande demais).
  const type = (err as { type?: string })?.type;
  if (type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
  if (type === "entity.too.large") return res.status(413).json({ error: "Conteúdo grande demais" });

  console.error(err);
  return res.status(500).json({ error: "Erro interno" });
}

/** Traduz as falhas de conexão mais comuns em instruções (nunca mostra o DATABASE_URL). */
export function dbHint(message: string) {
  if (/Authentication failed|credentials .* are not valid/i.test(message)) {
    return (
      "O Postgres recusou o usuário/senha do DATABASE_URL. Causa provável: outro Postgres (de outra cópia do " +
      "projeto) está na mesma porta. Pare o outro db:local e rode o desta pasta."
    );
  }
  if (/Can't reach database server/i.test(message)) {
    return "O Postgres não está rodando. Rode `npm run db:local` (ou `npm run db:up`).";
  }
  return message.split("\n").filter(Boolean).slice(-1)[0] ?? "falha ao conectar ao banco";
}
