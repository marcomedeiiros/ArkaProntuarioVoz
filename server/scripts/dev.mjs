// `npm run dev`: sobe o Postgres local (se ainda não estiver no ar), aplica as migrations pendentes
// e inicia a API em modo watch. Ctrl+C para tudo, inclusive o banco que este script subiu.
import { spawn, spawnSync } from "node:child_process";
import { LocalDbError, startLocalDb } from "./local-db.mjs";

let pg = null;
try {
  pg = await startLocalDb({ reuseRunning: true });
} catch (err) {
  if (!(err instanceof LocalDbError)) console.error(err);
  process.exit(1);
}

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (pg) await pg.stop().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

// Banco novo (ou migrations novas do git pull) ficaria sem tabelas e o login quebraria.
const migrate = spawnSync("npx prisma migrate deploy", { stdio: "inherit", shell: true });
if (migrate.status !== 0) {
  console.error("Falha ao aplicar as migrations do banco (veja o erro acima).");
  await stop(1);
}

const api = spawn("npx tsx watch src/index.ts", { stdio: "inherit", shell: true });
api.on("exit", (code) => stop(code ?? 0));
