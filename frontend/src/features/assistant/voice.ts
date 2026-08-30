import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking";
type VoiceRole = "user" | "assistant";

type VoiceBootstrap = {
  ephemeralToken: string;
  model: string;
  voiceName: string;
  maxDurationSeconds: number;
  idleTimeoutSeconds: number;
};

export type VoiceControllerEvents = {
  onState: (state: VoiceState, status: string) => void;
  onTranscript: (role: VoiceRole, text: string) => void;
  onTurnComplete: () => void;
  onError: (message: string) => void;
};

function readBootstrap(value: unknown): VoiceBootstrap {
  if (!value || typeof value !== "object") {
    throw new Error("voice_bootstrap_invalid");
  }
  const candidate = value as Partial<VoiceBootstrap>;
  if (
    typeof candidate.ephemeralToken !== "string"
    || typeof candidate.model !== "string"
    || typeof candidate.voiceName !== "string"
    || typeof candidate.maxDurationSeconds !== "number"
    || typeof candidate.idleTimeoutSeconds !== "number"
  ) {
    throw new Error("voice_bootstrap_invalid");
  }
  return candidate as VoiceBootstrap;
}

function floatToPcm16Base64(samples: Float32Array, sourceRate: number): string {
  const ratio = sourceRate / 16_000;
  const pcm = new Int16Array(Math.max(1, Math.floor(samples.length / ratio)));
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = samples[Math.min(samples.length - 1, Math.floor(index * ratio))] ?? 0;
    const value = Math.max(-1, Math.min(1, sample));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  let binary = "";
  for (const byte of new Uint8Array(pcm.buffer)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodePcm16(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

export class VoiceController {
  private session: Session | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private playbackCursor = 0;
  private durationTimer: number | null = null;
  private idleTimer: number | null = null;
  private lastActivityAt = 0;
  private stopping = false;
  private state: VoiceState = "idle";

  constructor(private readonly events: VoiceControllerEvents) {}

  get isActive(): boolean {
    return this.state !== "idle";
  }

  async start(locale: string): Promise<void> {
    if (this.isActive) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) {
      this.events.onError("Voice is not supported in this browser. You can continue by typing.");
      return;
    }

    this.stopping = false;
    this.setState("connecting", "Connecting voice...");

    try {
      const response = await fetch("/api/assistant/voice/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, voiceProfileId: "calm" }),
      });
      if (!response.ok) {
        throw new Error("voice_disabled");
      }
      const bootstrap = readBootstrap(await response.json());

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });

      this.audioContext = new AudioContext({ latencyHint: "interactive" });
      await this.audioContext.resume();
      await this.audioContext.audioWorklet.addModule("/pcm-capture-worklet.js");

      const ai = new GoogleGenAI({
        apiKey: bootstrap.ephemeralToken,
        httpOptions: { apiVersion: "v1alpha" },
      });
      this.session = await ai.live.connect({
        model: bootstrap.model,
        callbacks: {
          onopen: () => this.setState("listening", "Listening..."),
          onmessage: (message) => this.handleMessage(message),
          onerror: () => this.fail("Voice connection was interrupted. You can continue by typing."),
          onclose: () => {
            if (!this.stopping) {
              this.fail("Voice session ended. You can continue by typing.");
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          temperature: 0.2,
          maxOutputTokens: 1024,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: bootstrap.voiceName },
            },
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: false,
              prefixPaddingMs: 40,
              silenceDurationMs: 650,
            },
          },
        },
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.captureNode = new AudioWorkletNode(this.audioContext, "pcm-capture-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      });
      this.captureNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.session || !this.audioContext) {
          return;
        }
        const samples = event.data;
        if (samples.some((sample) => Math.abs(sample) > 0.015)) {
          this.lastActivityAt = Date.now();
        }
        this.session.sendRealtimeInput({
          audio: {
            data: floatToPcm16Base64(samples, this.audioContext.sampleRate),
            mimeType: "audio/pcm;rate=16000",
          },
        });
      };
      source.connect(this.captureNode);

      this.lastActivityAt = Date.now();
      this.durationTimer = window.setTimeout(
        () => void this.stop("Voice session limit reached."),
        bootstrap.maxDurationSeconds * 1_000,
      );
      this.idleTimer = window.setInterval(() => {
        if (Date.now() - this.lastActivityAt > bootstrap.idleTimeoutSeconds * 1_000) {
          void this.stop("Voice session ended after inactivity.");
        }
      }, 5_000);
    } catch {
      await this.cleanup();
      this.setState("idle", "Voice off");
      this.events.onError(
        "Could not start voice. Check that voice is enabled and allow microphone access; typing still works.",
      );
    }
  }

  async stop(status = "Voice off"): Promise<void> {
    this.stopping = true;
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
      this.session?.close();
    } catch {
      // The session may already be closed.
    }
    await this.cleanup();
    this.setState("idle", status);
    this.stopping = false;
  }

  private handleMessage(message: LiveServerMessage): void {
    const inputText = message.serverContent?.inputTranscription?.text;
    const outputText = message.serverContent?.outputTranscription?.text;
    if (inputText) {
      this.events.onTranscript("user", inputText);
    }
    if (outputText) {
      this.events.onTranscript("assistant", outputText);
    }
    if (message.data) {
      this.playAudio(message.data);
    }
    if (message.serverContent?.interrupted) {
      this.stopPlayback();
      this.setState("listening", "Listening...");
    }
    if (message.serverContent?.turnComplete) {
      this.events.onTurnComplete();
    }
  }

  private playAudio(base64: string): void {
    if (!this.audioContext) {
      return;
    }
    const samples = decodePcm16(base64);
    const buffer = this.audioContext.createBuffer(1, samples.length, 24_000);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    const startsAt = Math.max(this.audioContext.currentTime + 0.02, this.playbackCursor);
    this.playbackCursor = startsAt + buffer.duration;
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      if (!this.activeSources.size && this.isActive) {
        this.setState("listening", "Listening...");
      }
    };
    source.start(startsAt);
    this.setState("speaking", "CareCall is speaking...");
  }

  private stopPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.activeSources.clear();
    this.playbackCursor = this.audioContext?.currentTime ?? 0;
  }

  private fail(message: string): void {
    void this.cleanup().finally(() => {
      this.setState("idle", "Voice off");
      this.events.onError(message);
    });
  }

  private setState(state: VoiceState, status: string): void {
    this.state = state;
    this.events.onState(state, status);
  }

  private async cleanup(): Promise<void> {
    if (this.durationTimer !== null) {
      window.clearTimeout(this.durationTimer);
    }
    if (this.idleTimer !== null) {
      window.clearInterval(this.idleTimer);
    }
    this.durationTimer = null;
    this.idleTimer = null;
    this.captureNode?.disconnect();
    this.captureNode = null;
    for (const track of this.mediaStream?.getTracks() ?? []) {
      track.stop();
    }
    this.mediaStream = null;
    this.stopPlayback();
    this.session = null;
    if (this.audioContext) {
      await this.audioContext.close().catch(() => undefined);
    }
    this.audioContext = null;
  }
}
