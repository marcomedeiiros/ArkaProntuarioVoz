import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import nodemailer from "nodemailer";
import { env } from "../env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Pasta local (ignorada pelo git) onde os e-mails de desenvolvimento são gravados em vez de enviados. */
export const OUTBOX_DIR = resolve(__dirname, "../../.mail-outbox");

// Portas em que a conexão já nasce criptografada (nas outras, STARTTLS é obrigatório).
const IMPLICIT_TLS_PORTS = [465, 2465];

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: IMPLICIT_TLS_PORTS.includes(env.SMTP_PORT),
      requireTLS: !IMPLICIT_TLS_PORTS.includes(env.SMTP_PORT), // nunca manda credenciais nem links em texto puro
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

/**
 * Envia um e-mail. Sem SMTP configurado, em desenvolvimento, grava a mensagem em server/.mail-outbox
 * (nunca no terminal: o conteúdo pode ter links de acesso). Em produção sem SMTP, falha.
 */
export async function sendMail(mail: Mail) {
  if (transport) {
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    return;
  }
  if (env.NODE_ENV === "production") throw new Error("SMTP não configurado");

  mkdirSync(OUTBOX_DIR, { recursive: true });
  const file = resolve(OUTBOX_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.html`);
  const header = `<p style="font:12px monospace;color:#666">Para: ${escapeHtml(mail.to)}<br>Assunto: ${escapeHtml(mail.subject)}</p><hr>`;
  writeFileSync(file, header + mail.html, { mode: 0o600 });
  console.log(`[e-mail de desenvolvimento] "${mail.subject}" gravado em server/.mail-outbox (SMTP não configurado).`);
}

/** Confere conexão e login no SMTP, sem enviar nada. Não há o que conferir sem SMTP configurado. */
export async function verifyMailer() {
  if (!transport) return false;
  await transport.verify();
  return true;
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
