// Postgres embutido para desenvolvimento, sem precisar instalar Postgres nem Docker.
// Os dados ficam em server/.pgdata. Use Ctrl+C para parar.
// Usuário, senha, porta e banco vêm do DATABASE_URL do server/.env: nada fica no código.
// O `npm run dev` também usa este arquivo (via startLocalDb) para subir o banco junto com a API.
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";

/** Erro já explicado no terminal: quem chamou só precisa encerrar. */
export class LocalDbError extends Error {}

function fail(message) {
  console.error(message);
  throw new LocalDbError(message);
}

function portInUse(port) {
  return new Promise((done) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      done(true);
    });
    socket.on("error", () => done(false));
  });
}

/**
 * Sobe o Postgres embutido e devolve a instância (para chamar .stop()).
 * Com { reuseRunning: true }, se a porta já estiver ocupada assume que o banco já está no ar
 * (ex.: um `npm run db:local` aberto em outro terminal) e devolve null.
 */
export async function startLocalDb({ reuseRunning = false } = {}) {
  if (!process.env.DATABASE_URL) fail("Defina DATABASE_URL em server/.env (veja server/env.example).");

  const url = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    if (reuseRunning) return null; // banco remoto: não há nada para subir aqui
    fail("O Postgres embutido só roda em localhost. Ajuste o host do DATABASE_URL.");
  }
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = url.pathname.replace(/^\//, "");
  if (!user || !password || !database) fail("DATABASE_URL precisa ter usuário, senha e nome do banco.");

  // Porta ocupada = outro Postgres rodando (muitas vezes o db:local de outra cópia do projeto).
  const port = Number(url.port || 5432);
  if (await portInUse(port)) {
    if (reuseRunning) {
      console.log(`Postgres já está rodando em localhost:${port}; usando esse.`);
      return null;
    }
    fail(
      `A porta ${port} já está em uso por outro Postgres (talvez o db:local de outra cópia do projeto).\n` +
        "Pare o outro primeiro, ou use outra porta no DATABASE_URL desta pasta (ex.: localhost:5433).",
    );
  }

  const databaseDir = fileURLToPath(new URL("../.pgdata", import.meta.url));
  const firstRun = !existsSync(databaseDir);

  const pg = new EmbeddedPostgres({
    databaseDir,
    user,
    password,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    // Sem isso o Windows cria o banco em WIN1252, que não aceita emojis (usados no guia dos pais).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // Só aceita conexões desta máquina.
    postgresFlags: ["-c", "listen_addresses=localhost"],
    // Sem eco dos logs rotineiros: se o terminal for fechado, escrever neles trava o processo (e o banco).
    onLog: () => {},
    onError: (err) => {
      try {
        console.error(String(err));
      } catch {
        /* terminal fechado */
      }
    },
  });

  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase(database);
  // Não imprime a URL: ela contém a senha.
  console.log(`Postgres local pronto em localhost:${port} (banco "${database}").`);
  return pg;
}

// Rodado direto (npm run db:local): sobe e fica esperando Ctrl+C.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let pg;
  try {
    pg = await startLocalDb();
  } catch (err) {
    if (!(err instanceof LocalDbError)) console.error(err);
    process.exit(1);
  }
  async function shutdown() {
    await pg.stop();
    process.exit(0);
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(() => {}, 1 << 30);
}
