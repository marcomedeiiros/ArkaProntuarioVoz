import { z } from "zod";

/** Validações comuns do servidor. O front-end pode validar para UX, mas quem decide é aqui. */

export const id = z.string().min(1).max(40);

export const name = (label: string) =>
  z.string().trim().min(2, `${label} precisa ter pelo menos 2 caracteres`).max(120, `${label} muito longo`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texto muito longo (máximo ${max} caracteres)`)
    .nullish()
    .transform((v) => (v ? v : null));

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .pipe(z.email("E-mail inválido"));

// bcrypt ignora o que passa de 72 bytes; limitar evita senhas truncadas silenciosamente.
export const password = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(72, "Senha muito longa");

/** Telefone brasileiro: guarda só dígitos, com DDD (10 ou 11 dígitos) e opcionalmente o 55. */
export const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((d) => /^(55)?\d{10,11}$/.test(d), "Telefone inválido. Use DDD + número, ex.: (27) 99999-9999");

/** Data no formato AAAA-MM-DD (ou ISO), normalizada para meia-noite UTC. */
export const dateOnly = z.coerce.date().transform((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));

/** Valor em reais: positivo, até R$ 1 milhão, arredondado para centavos. */
export const money = z
  .number("Valor inválido")
  .positive("O valor precisa ser maior que zero")
  .max(1_000_000, "Valor acima do limite permitido")
  .transform((v) => Math.round(v * 100) / 100);

export const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido, use AAAA-MM")
  .optional();
