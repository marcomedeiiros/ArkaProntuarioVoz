import { resolve } from "node:path";
import { env as hf, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { env } from "../env";
import { HttpError } from "../lib/http-error";
import { SAMPLE_RATE } from "../lib/audio";

/*
 * Transcrição com Whisper rodando neste servidor (ONNX, CPU). O áudio nunca sai da nossa
 * infraestrutura nem é gravado em disco: chega em memória, vira texto e é descartado.
 * O modelo é baixado uma única vez do Hugging Face para server/.models.
 */
hf.cacheDir = resolve(__dirname, "../../.models");
hf.allowLocalModels = false;
hf.allowRemoteModels = !env.WHISPER_OFFLINE;

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

export function loadTranscriber() {
  loading ??= pipeline("automatic-speech-recognition", env.WHISPER_MODEL, {
    device: "cpu",
    dtype: { encoder_model: env.WHISPER_DTYPE, decoder_model_merged: env.WHISPER_DTYPE },
  }).catch((err) => {
    loading = null; // permite tentar de novo na próxima requisição
    throw err;
  });
  return loading;
}

// A inferência usa todos os núcleos: um trecho por vez, em fila. Fila cheia = servidor ocupado.
const MAX_QUEUE = 24;
let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;

export async function transcribe(samples: Float32Array): Promise<string> {
  if (waiting >= MAX_QUEUE) throw new HttpError(503, "Transcrição sobrecarregada, tente em instantes");
  waiting++;
  const job = queue.then(async () => {
    const asr = await loadTranscriber();
    const seconds = samples.length / SAMPLE_RATE;
    const out = await asr(samples, {
      language: "portuguese",
      task: "transcribe",
      // Fala rápida dá ~4 tokens/s. O teto corta os laços de repetição típicos do Whisper.
      max_new_tokens: Math.min(440, Math.ceil(seconds * 8) + 16),
    });
    return cleanTranscript((Array.isArray(out) ? out[0] : out).text);
  });
  queue = job.catch(() => undefined).finally(() => waiting--);
  return job;
}

// Frases que o Whisper "ouve" em silêncio ou ruído (vêm das legendas usadas no treino).
const HALLUCINATIONS = [
  /^(obrigad[oa]( por assistir)?|tchau|valeu|\.+|…)[.!]*$/i,
  /legendas? (pela|por) comunidade/i,
  /amara\.org/i,
  /inscreva-se no canal/i,
];

/** Remove alucinações conhecidas e repetições em laço ("12 em 12 em 12 em 12..."). */
export function cleanTranscript(raw: string) {
  let text = raw.replace(/\s+/g, " ").trim();
  if (HALLUCINATIONS.some((re) => re.test(text))) return "";
  // Uma mesma sequência de 1 a 6 palavras repetida 4+ vezes seguidas vira uma só ocorrência.
  text = text.replace(/(\b(?:\S+\s+){0,5}\S+\b)(?:[\s,]+\1\b){3,}/gi, "$1");
  return text;
}
