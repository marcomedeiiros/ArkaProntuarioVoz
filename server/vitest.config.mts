import "dotenv/config";
import { randomBytes } from "node:crypto";
import { defineConfig } from "vitest/config";

// Banco usado só pelos testes (sobrescreva com TEST_DATABASE_URL, ex.: no CI).
// Sem ele, usa o mesmo servidor e usuário do DATABASE_URL, num banco "<nome>_test".
// O nome precisa terminar em "_test": os testes apagam tudo dele.
if (!process.env.TEST_DATABASE_URL) {
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL (server/.env) ou TEST_DATABASE_URL.");
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/^\//, "").replace(/_test$/, "")}_test`;
  process.env.TEST_DATABASE_URL = url.toString();
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Os arquivos compartilham o mesmo banco de testes: um de cada vez.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      // Segredos descartáveis, novos a cada execução: nada fixo no repositório.
      JWT_SECRET: randomBytes(48).toString("base64url"),
      CLIENT_URL: "http://localhost:5173",
      // A IA é sempre simulada nos testes; esta chave nunca chega à Anthropic.
      ANTHROPIC_API_KEY: "chave-falsa-dos-testes",
    },
  },
});
