class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.pendingLength = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const copy = new Float32Array(channel);
    this.pending.push(copy);
    this.pendingLength += copy.length;
    if (this.pendingLength < 2048) return true;
    const chunk = new Float32Array(this.pendingLength);
    let offset = 0;
    for (const part of this.pending) {
      chunk.set(part, offset);
      offset += part.length;
    }
    this.pending = [];
    this.pendingLength = 0;
    this.port.postMessage(chunk, [chunk.buffer]);
    return true;
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
