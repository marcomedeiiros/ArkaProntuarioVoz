import { HttpError } from "./http-error";

/** Formato que o navegador envia: PCM 16 bits, mono, 16 kHz, little-endian, sem cabeçalho. */
export const SAMPLE_RATE = 16_000;
export const MIN_SECONDS = 0.5;
export const MAX_SECONDS = 30; // janela máxima do Whisper
export const MAX_BYTES = MAX_SECONDS * SAMPLE_RATE * 2;

export function decodePcm16(body: unknown): Float32Array {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new HttpError(415, "Envie o áudio como application/octet-stream (PCM 16 bits, 16 kHz, mono)");
  }
  if (body.length % 2 !== 0) throw new HttpError(400, "Áudio inválido");
  const seconds = body.length / 2 / SAMPLE_RATE;
  if (seconds < MIN_SECONDS) throw new HttpError(400, "Trecho de áudio curto demais");
  if (seconds > MAX_SECONDS) throw new HttpError(413, `Envie trechos de até ${MAX_SECONDS} segundos`);

  const samples = new Float32Array(body.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = body.readInt16LE(i * 2) / 32768;
  return samples;
}

/**
 * Há fala suficiente para valer a transcrição? Conta janelas de 30 ms com energia acima do limiar.
 * Evita gastar CPU e, principalmente, as alucinações do Whisper em trechos de silêncio.
 */
export function hasSpeech(samples: Float32Array, minVoicedSeconds = 0.25) {
  const win = Math.round(SAMPLE_RATE * 0.03);
  let voiced = 0;
  for (let start = 0; start + win <= samples.length; start += win) {
    let energy = 0;
    for (let i = start; i < start + win; i++) energy += samples[i] * samples[i];
    if (Math.sqrt(energy / win) > 0.01) voiced++;
  }
  return voiced * 0.03 >= minVoicedSeconds;
}
