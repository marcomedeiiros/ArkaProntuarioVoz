import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/*
 * Grava o microfone e transcreve no NOSSO servidor (Whisper), sem Google nem outro terceiro.
 * O áudio é cortado nas pausas da fala em trechos de 6 a 24 s, enviados um por vez e em ordem.
 * Nada fica guardado no navegador: cada trecho vai da memória para o servidor e é descartado.
 */

const FRAME_S = 0.1; // o worklet entrega blocos de 100 ms, já em 16 kHz
const MIN_CHUNK_S = 6; // a partir daqui, corta na primeira pausa
const MAX_CHUNK_S = 24; // limite: corta no ponto mais silencioso dos últimos segundos
const PAUSE_FRAMES = 6; // 600 ms de silêncio = pausa
const PREROLL_FRAMES = 3; // guarda 300 ms antes da fala para não cortar a primeira sílaba
const MIN_VOICED_FRAMES = 3;
const MAX_RETRIES = 3;

export const recordingSupported =
  typeof window !== "undefined" &&
  window.isSecureContext &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof AudioWorkletNode !== "undefined";

interface Frame {
  samples: Float32Array;
  rms: number;
  voiced: boolean;
}

function toPcm16(frames: Frame[]) {
  const out = new Int16Array(frames.reduce((n, f) => n + f.samples.length, 0));
  let o = 0;
  for (const f of frames) {
    for (let i = 0; i < f.samples.length; i++) {
      const s = Math.max(-1, Math.min(1, f.samples[i]));
      out[o++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
  return out;
}

function micErrorMessage(err: unknown) {
  const name = (err as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Permissão do microfone negada. Libere o acesso nas configurações do navegador.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nenhum microfone encontrado neste aparelho.";
  if (name === "NotReadableError") return "O microfone está em uso por outro programa.";
  return "Não foi possível acessar o microfone.";
}

/**
 * @param consultationId consulta que recebe o áudio (o servidor confere permissão e status)
 * @param onText chamado com cada trecho transcrito, na ordem da fala
 */
export function useServerTranscription(consultationId: string | undefined, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const capture = useRef<{ ctx: AudioContext; stream: MediaStream; node: AudioWorkletNode } | null>(null);
  const frames = useRef<Frame[]>([]);
  const noiseFloor = useRef(0.01);
  const queue = useRef<Int16Array<ArrayBuffer>[]>([]);
  const sending = useRef(false);
  const idleWaiters = useRef<(() => void)[]>([]);
  const lastLevel = useRef(0);

  const pump = useCallback(async () => {
    if (sending.current || !consultationId) return;
    sending.current = true;
    while (queue.current.length) {
      const chunk = queue.current[0];
      let attempt = 0;
      for (;;) {
        try {
          const { text } = await api.postBinary<{ text: string }>(`/consultations/${consultationId}/audio`, chunk);
          if (text) onTextRef.current(text);
          break;
        } catch (err) {
          const status = err instanceof ApiError ? err.status : 0; // 0 = falha de rede
          const retryable = status === 0 || status === 503 || status >= 500;
          if (retryable && ++attempt <= MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            continue;
          }
          setError(
            status === 0
              ? "Sem conexão com o servidor: um trecho da gravação não foi transcrito."
              : (err as Error).message,
          );
          if (status === 403 || status === 404 || status === 409) queue.current.length = 1; // não adianta insistir
          break;
        }
      }
      queue.current.shift();
      setPending(queue.current.length);
    }
    sending.current = false;
    idleWaiters.current.splice(0).forEach((resolve) => resolve());
  }, [consultationId]);

  const enqueue = useCallback(
    (chunk: Frame[]) => {
      if (chunk.filter((f) => f.voiced).length < MIN_VOICED_FRAMES) return; // só silêncio: nem envia
      queue.current.push(toPcm16(chunk));
      setPending(queue.current.length);
      void pump();
    },
    [pump],
  );

  const onFrame = useCallback(
    (samples: Float32Array) => {
      let energy = 0;
      for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
      const rms = Math.sqrt(energy / samples.length);

      // Piso de ruído adaptativo: cai rápido para o nível do ambiente e sobe devagar.
      noiseFloor.current = Math.min(noiseFloor.current * 1.01 + 1e-5, Math.max(rms, 0.0005));
      const voiced = rms > Math.max(noiseFloor.current * 3, 0.008);

      const buf = frames.current;
      buf.push({ samples, rms, voiced });

      const shown = Math.min(1, rms * 8);
      if (Math.abs(shown - lastLevel.current) > 0.04) {
        lastLevel.current = shown;
        setLevel(shown);
      }

      // Antes de alguém falar, guarda só um pequeno trecho de "pré-fala".
      if (!buf.some((f) => f.voiced)) {
        if (buf.length > PREROLL_FRAMES) buf.splice(0, buf.length - PREROLL_FRAMES);
        return;
      }

      const seconds = buf.length * FRAME_S;
      const pause = buf.length >= PAUSE_FRAMES && buf.slice(-PAUSE_FRAMES).every((f) => !f.voiced);
      if (seconds >= MIN_CHUNK_S && pause) {
        enqueue(buf.splice(0));
      } else if (seconds >= MAX_CHUNK_S) {
        // Fala contínua: corta no bloco mais silencioso dos últimos 6 s.
        const from = buf.length - Math.round(6 / FRAME_S);
        let cut = buf.length;
        for (let i = from, min = Infinity; i < buf.length; i++) {
          if (buf[i].rms < min) {
            min = buf[i].rms;
            cut = i + 1;
          }
        }
        enqueue(buf.splice(0, cut));
      }
    },
    [enqueue],
  );

  const teardown = useCallback(() => {
    const cap = capture.current;
    capture.current = null;
    if (!cap) return;
    cap.node.port.onmessage = null;
    cap.node.disconnect();
    cap.stream.getTracks().forEach((t) => t.stop());
    void cap.ctx.close();
  }, []);

  const start = useCallback(async () => {
    if (capture.current || !recordingSupported) return;
    setError(null);
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      ctx = new AudioContext();
      await ctx.audioWorklet.addModule("/pcm-recorder.worklet.js");
      const node = new AudioWorkletNode(ctx, "pcm-recorder");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data);
      // Liga ao destino com volume zero: garante que o navegador processe o nó, sem tocar o som.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
      await ctx.resume(); // pode nascer suspenso depois do pedido de permissão
      capture.current = { ctx, stream, node };
      frames.current = [];
      noiseFloor.current = 0.01;
      setListening(true);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setError(micErrorMessage(err));
    }
  }, [onFrame]);

  /** Para de gravar. O último trecho segue para transcrição. */
  const stop = useCallback(() => {
    if (!capture.current) return;
    teardown();
    enqueue(frames.current.splice(0));
    setListening(false);
    setLevel(0);
    lastLevel.current = 0;
  }, [enqueue, teardown]);

  /** Para de gravar e espera todos os trechos serem transcritos (ex.: antes de gerar o prontuário). */
  const finish = useCallback(async () => {
    stop();
    if (!sending.current && queue.current.length === 0) return;
    await new Promise<void>((resolve) => idleWaiters.current.push(resolve));
  }, [stop]);

  // Ao sair da tela, solta o microfone. Trechos na fila continuam sendo enviados:
  // o servidor já grava o texto na consulta, então nada se perde.
  useEffect(() => () => stop(), [stop]);

  return { supported: recordingSupported, listening, pending, level, error, start, stop, finish };
}
