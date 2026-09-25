/** Banco dos testes, definido em vitest.config.mts (ou pela variável TEST_DATABASE_URL). */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL!;

/** Trava de segurança: os testes apagam o banco, então ele precisa terminar com "_test". */
export function assertIsTestDatabase(url: string | undefined) {
  if (!url) throw new Error("TEST_DATABASE_URL não definida. Rode os testes com `npm test`.");
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Por segurança, o banco de testes precisa terminar com "_test" (recebido: "${name}")`);
  }
  return name;
}
