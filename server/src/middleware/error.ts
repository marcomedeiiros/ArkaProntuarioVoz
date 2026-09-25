import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";

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
