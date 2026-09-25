import { app } from "./app";
import { env } from "./env";
import { loadTranscriber } from "./services/transcriber";
import { verifyMailer } from "./lib/mailer";
import { bootstrapAdminFromEnv } from "./lib/bootstrap-admin";

app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT}`);
  // Carrega o Whisper em segundo plano para a primeira gravação não esperar (na 1ª vez, baixa o modelo).
  const started = Date.now();
  loadTranscriber().then(
    () => console.log(`Transcrição local pronta (${env.WHISPER_MODEL}, ${((Date.now() - started) / 1000).toFixed(0)} s)`),
    (err) => console.error("Falha ao carregar o modelo de transcrição:", (err as Error).message),
  );
  // Cria o administrador do .env se ele ainda não existir neste banco.
  bootstrapAdminFromEnv().catch((err) =>
    console.error("[aviso] Não foi possível criar o administrador do .env:", err instanceof Error ? err.message : err),
  );
  // Confere o SMTP (conexão e login) para um erro de configuração aparecer já na subida.
  verifyMailer().then(
    (configured) => configured && console.log(`E-mail pronto (${env.SMTP_HOST})`),
    (err) => console.error("[aviso] SMTP recusou a conexão ou o login:", (err as Error).message),
  );
});
