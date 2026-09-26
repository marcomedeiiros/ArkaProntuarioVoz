import { app } from "./app";
import { env } from "./env";
import { loadTranscriber } from "./services/transcriber";
import { verifyMailer } from "./lib/mailer";
import { bootstrapAdminFromEnv } from "./lib/bootstrap-admin";
import { prisma } from "./lib/prisma";
import { dbHint } from "./middleware/error";
import { aiKeyStatus } from "./services/ai-settings";
import { migrateAllTenants, provisionTenant } from "./lib/tenant";

app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT}`);
  // Carrega o Whisper em segundo plano para a primeira gravação não esperar (na 1ª vez, baixa o modelo).
  const started = Date.now();
  loadTranscriber().then(
    () => console.log(`Transcrição local pronta (${env.WHISPER_MODEL}, ${((Date.now() - started) / 1000).toFixed(0)} s)`),
    (err) => console.error("Falha ao carregar o modelo de transcrição:", (err as Error).message),
  );
  // Confere o banco já na subida (o problema aparece aqui, e não só na hora do login) e,
  // com o banco ok, cria o administrador do .env se ele ainda não existir.
  prisma.$queryRaw`SELECT 1`
    .then(async () => {
      console.log("Banco de dados conectado");
      // Espaço de dados de cada clínica: aplica migrações novas e prepara clínicas liberadas antes
      // da separação (copiando os dados antigos delas para o schema próprio).
      try {
        const pending = await prisma.clinic.findMany({ where: { status: "ACTIVE", provisionedAt: null }, select: { id: true } });
        for (const c of pending) await provisionTenant(c.id);
        const total = await migrateAllTenants();
        console.log(`Espaços de dados das clínicas prontos (${total})`);
      } catch (err) {
        console.error("[aviso] Falha ao preparar os espaços das clínicas:", (err as Error).message);
      }
      void aiKeyStatus().then((s) => {
        if (!s.configured) {
          console.warn("[aviso] IA sem chave da Anthropic: cadastre em Arka > Configurações (ou ANTHROPIC_API_KEY no .env).");
        }
      });
      return bootstrapAdminFromEnv().catch((err) =>
        console.error("[aviso] Não foi possível criar o administrador do .env:", err instanceof Error ? err.message : err),
      );
    })
    .catch((err: Error) => {
      console.error(`[aviso] ${dbHint(err.message)}`);
      void prisma.$disconnect().catch(() => {}); // tenta de novo na próxima requisição
    });
  // Confere o SMTP (conexão e login) para um erro de configuração aparecer já na subida.
  verifyMailer().then(
    (configured) => configured && console.log(`E-mail pronto (${env.SMTP_HOST})`),
    (err) => console.error("[aviso] SMTP recusou a conexão ou o login:", (err as Error).message),
  );
});
