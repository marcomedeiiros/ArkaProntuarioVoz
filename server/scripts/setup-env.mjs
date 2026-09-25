// Cria ou corrige o server/.env com segredos fortes, sem nunca imprimir nenhum valor.
//
//   npm run setup:env                      gera JWT_SECRET (se faltar ou for fraco) e DATABASE_URL (se faltar)
//   npm run setup:env -- --rotate-db       também troca a senha do usuário do Postgres e atualiza o DATABASE_URL
//   npm run setup:env -- --rotate-jwt      troca o JWT_SECRET mesmo que já seja forte (derruba todas as sessões)
//   npm run setup:env -- --anthropic-key   pede a chave da Anthropic sem mostrá-la na tela (não fica no histórico)
//   npm run setup:env -- --resend          configura o envio de e-mails pelo Resend (pede a API key sem mostrá-la)
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));
const args = new Set(process.argv.slice(2));
const secret = (bytes) => randomBytes(bytes).toString("base64url");

const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
const get = (key) => {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"(.*)"$/, "$1") : undefined;
};
const set = (key, value) => {
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}="${value}"`;
  else lines.push(`${key}="${value}"`);
};
const changed = [];

const jwt = get("JWT_SECRET") ?? "";
if (args.has("--rotate-jwt") || jwt.length < 32 || /troque|example|exemplo|changeme/i.test(jwt)) {
  set("JWT_SECRET", secret(48));
  changed.push("JWT_SECRET (todas as sessões abertas foram encerradas)");
}

let dbUrl = get("DATABASE_URL");
if (!dbUrl) {
  dbUrl = `postgresql://pedscribe:${secret(24)}@localhost:5432/pedscribe?schema=public`;
  set("DATABASE_URL", dbUrl);
  changed.push("DATABASE_URL (use num banco novo: apague server/.pgdata se ele já existir)");
} else if (args.has("--rotate-db")) {
  const url = new URL(dbUrl);
  const user = decodeURIComponent(url.username);
  const password = secret(24);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    // ALTER ROLE não aceita parâmetros; o identificador vai entre aspas e a senha só tem caracteres base64url.
    await prisma.$executeRawUnsafe(`ALTER ROLE "${user.replace(/"/g, '""')}" WITH PASSWORD '${password}'`);
  } finally {
    await prisma.$disconnect();
  }
  url.password = password;
  set("DATABASE_URL", url.toString());
  changed.push("senha do Postgres e DATABASE_URL (reinicie o db:local e a API)");
}

const looksInvalid = (key = "") => key.length < 40 || key.includes("...") || !key.startsWith("sk-ant-");

if (args.has("--anthropic-key")) {
  const key = await askHidden("Cole a chave da Anthropic (console.anthropic.com > API Keys) e tecle Enter: ");
  if (looksInvalid(key)) {
    console.error("Isso não parece uma chave da Anthropic (deve começar com sk-ant- e ser longa). Nada foi alterado.");
    process.exit(1);
  }
  set("ANTHROPIC_API_KEY", key);
  changed.push("ANTHROPIC_API_KEY (reinicie a API)");
} else if (get("ANTHROPIC_API_KEY") === undefined) {
  set("ANTHROPIC_API_KEY", "");
}

// Transcrição local: só acrescenta o que faltar, sem mexer no que você já configurou.
const whisperDefaults = {
  WHISPER_MODEL: "onnx-community/whisper-large-v3-turbo",
  WHISPER_DTYPE: "q8",
  WHISPER_OFFLINE: "0",
};
for (const [key, value] of Object.entries(whisperDefaults)) {
  if (get(key) === undefined) {
    set(key, value);
    changed.push(`${key}=${value}`);
  }
}
if (args.has("--resend")) {
  console.log("Configurando o e-mail pelo Resend (resend.com > API Keys; permissão \"Sending access\" basta).");
  const key = await askHidden("Cole a API key do Resend e tecle Enter: ");
  if (!/^re_[A-Za-z0-9_-]{20,}$/.test(key)) {
    console.error("Isso não parece uma API key do Resend (começa com re_). Nada foi alterado.");
    process.exit(1);
  }
  const currentFrom = get("MAIL_FROM") || "Prontuário por Voz <onboarding@resend.dev>";
  const from = (await ask(`Remetente [${currentFrom}]: `)) || currentFrom;
  // "Nome <email@dominio>" ou só "email@dominio"; sem aspas nem quebras de linha (vai para o .env).
  if (/["\r\n]/.test(from) || !/(^|<)[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/.test(from)) {
    console.error("Remetente inválido. Use algo como: Prontuário por Voz <nao-responda@seudominio.com.br>");
    process.exit(1);
  }
  const currentApp = get("APP_URL") || get("CLIENT_URL") || "http://localhost:5173";
  const appUrl = (await ask(`Endereço do sistema usado nos links [${currentApp}]: `)) || currentApp;

  set("SMTP_HOST", "smtp.resend.com");
  set("SMTP_PORT", "465"); // TLS direto desde o primeiro byte
  set("SMTP_USER", "resend");
  set("SMTP_PASS", key);
  set("MAIL_FROM", from);
  set("APP_URL", appUrl);
  changed.push("SMTP pelo Resend (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL)");
  if (from.includes("@resend.dev")) {
    console.log(
      "Aviso: com o remetente de teste onboarding@resend.dev, o Resend só entrega para o e-mail da sua própria conta.\n" +
        "Para enviar para qualquer pessoa, verifique seu domínio em resend.com > Domains e use um remetente dele.",
    );
  }
}

// E-mail (redefinição de senha). Em branco no desenvolvimento: as mensagens vão para server/.mail-outbox.
for (const key of ["APP_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) {
  if (get(key) === undefined) set(key, key === "SMTP_PORT" ? "587" : "");
}
if (!get("PORT")) set("PORT", "3333");
if (!get("CLIENT_URL")) set("CLIENT_URL", "http://localhost:5173");

writeFileSync(ENV_FILE, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });

if (changed.length) {
  console.log("server/.env atualizado:");
  for (const c of changed) console.log(`  - ${c}`);
} else {
  console.log("server/.env já está com segredos fortes. Nada mudou.");
}
if (looksInvalid(get("ANTHROPIC_API_KEY"))) {
  console.log("Atenção: ANTHROPIC_API_KEY está vazia ou é o texto de exemplo. Rode: npm run setup:env -- --anthropic-key");
}

/** Lê uma linha do terminal (visível). */
function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Lê uma linha do terminal sem ecoar os caracteres digitados/colados. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}
