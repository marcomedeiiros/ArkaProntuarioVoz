// Roda na thread de áudio do navegador: converte o microfone para 16 kHz mono (formato do Whisper)
// e entrega blocos de 100 ms para a página. Nada é gravado: os blocos ficam só na memória.
const TARGET_RATE = 16000;
const FRAME = TARGET_RATE / 10;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE; // `sampleRate` é global no AudioWorklet
    this.pos = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Float32Array(FRAME);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      // Reamostragem por média da janela: filtra agudos acima de 8 kHz e reduz a taxa.
      this.sum += channel[i];
      this.count++;
      this.pos += 1;
      if (this.pos < this.ratio) continue;
      this.pos -= this.ratio;
      this.frame[this.filled++] = this.sum / this.count;
      this.sum = 0;
      this.count = 0;
      if (this.filled === FRAME) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(FRAME);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
