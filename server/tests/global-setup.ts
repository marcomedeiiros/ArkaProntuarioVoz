import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertIsTestDatabase, TEST_DATABASE_URL } from "./test-db";

/** Roda uma vez antes de todos os testes: cria o banco de testes (se preciso) e aplica as migrations. */
export default async function setup() {
  const dbName = assertIsTestDatabase(TEST_DATABASE_URL);

  const serverUrl = new URL(TEST_DATABASE_URL!);
  serverUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: serverUrl.toString() });
  try {
    const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } catch (err) {
    throw new Error(
      "Não foi possível conectar ao Postgres para os testes. Deixe o banco rodando " +
        "(`npm run db:local` ou `docker compose up -d db`) ou defina TEST_DATABASE_URL.\n" +
        String(err),
    );
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
