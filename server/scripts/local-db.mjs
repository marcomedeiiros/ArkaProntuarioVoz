// Postgres embutido para desenvolvimento, sem precisar instalar Postgres nem Docker.
// Os dados ficam em server/.pgdata. Use Ctrl+C para parar.
// Usuário, senha, porta e banco vêm do DATABASE_URL do server/.env: nada fica no código.
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import net from "node:net";

if (!process.env.DATABASE_URL) {
  console.error("Defina DATABASE_URL em server/.env (veja server/env.example).");
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error("O Postgres embutido só roda em localhost. Ajuste o host do DATABASE_URL.");
  process.exit(1);
}
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.replace(/^\//, "");
if (!user || !password || !database) {
  console.error("DATABASE_URL precisa ter usuário, senha e nome do banco.");
  process.exit(1);
}

const databaseDir = new URL("../.pgdata", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const firstRun = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port: Number(url.port || 5432),
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

// Porta ocupada = outro Postgres rodando (muitas vezes o db:local de outra cópia do projeto).
const port = Number(url.port || 5432);
const busy = await new Promise((done) => {
  const socket = net.connect({ host: "127.0.0.1", port }, () => {
    socket.destroy();
    done(true);
  });
  socket.on("error", () => done(false));
});
if (busy) {
  console.error(
    `A porta ${port} já está em uso por outro Postgres (talvez o db:local de outra cópia do projeto).\n` +
      "Pare o outro primeiro, ou use outra porta no DATABASE_URL desta pasta (ex.: localhost:5433).",
  );
  process.exit(1);
}

if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase(database);
// Não imprime a URL: ela contém a senha.
console.log(`Postgres local pronto em localhost:${url.port || 5432} (banco "${database}").`);

async function shutdown() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
