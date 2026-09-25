// Baixa o modelo de transcrição para server/.models (útil antes de ir para produção ou ficar offline).
//   npm run whisper:download
import { env } from "../src/env";
import { loadTranscriber } from "../src/services/transcriber";

console.log(`Baixando ${env.WHISPER_MODEL} (${env.WHISPER_DTYPE}). Na primeira vez pode levar alguns minutos...`);
loadTranscriber()
  .then(() => console.log("Modelo pronto em server/.models."))
  .catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
