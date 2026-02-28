import { GoogleGenAI, Modality, Session } from "@google/genai";
import { LiveSessionCallbacks } from "../types";

const MODEL_NAME = "gemini-live-2.5-flash-native-audio";

let currentSession: Session | null = null;
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let audioWorkletNode: AudioWorkletNode | null = null;
let processorNode: ScriptProcessorNode | null = null;
let isSessionReady = false;

function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function resampleTo16kHz(
  audioData: Float32Array,
  originalSampleRate: number
): Float32Array {
  const targetSampleRate = 16000;
  if (originalSampleRate === targetSampleRate) {
    return audioData;
  }
  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.round(audioData.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
    const t = srcIndex - srcIndexFloor;
    result[i] =
      audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
  }
  return result;
}

export async function startLiveSession(
  callbacks: LiveSessionCallbacks
): Promise<void> {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  let accumulatedText = "";

  isSessionReady = false;

  try {
    const session = await ai.live.connect({
      model: MODEL_NAME,
      config: {
        responseModalities: [Modality.TEXT],
        systemInstruction:
          "You are a transcription assistant. Listen to the audio and transcribe it accurately in the language spoken. If Bengali, write in Bengali script. If English, write in English. Output only the transcription text, nothing else. Do not add commentary or explanations.",
      },
      callbacks: {
        onopen: () => {
          console.log("Live session connected");
          isSessionReady = true;
          callbacks.onConnectionChange(true);
        },
        onmessage: (event: MessageEvent) => {
          try {
            const data =
              typeof event.data === "string"
                ? JSON.parse(event.data)
                : event.data;

            console.log("Live message received:", data);

            if (data.serverContent?.modelTurn?.parts) {
              for (const part of data.serverContent.modelTurn.parts) {
                if (part.text) {
                  accumulatedText += part.text;
                  callbacks.onTranscript(accumulatedText, false);
                }
              }
            }

            if (data.serverContent?.turnComplete) {
              callbacks.onTranscript(accumulatedText, true);
            }

            if (data.serverContent?.outputTranscription?.text) {
              accumulatedText += data.serverContent.outputTranscription.text;
              callbacks.onTranscript(accumulatedText, false);
            }

            if (data.setupComplete) {
              console.log("Live session setup complete");
              isSessionReady = true;
            }
          } catch (e) {
            console.warn("Error parsing live message:", e);
          }
        },
        onerror: (event: Event) => {
          console.error("Live session error:", event);
          isSessionReady = false;
          callbacks.onError(new Error("Live session error"));
          callbacks.onConnectionChange(false);
        },
        onclose: (event: CloseEvent) => {
          console.log("Live session closed, code:", event.code, "reason:", event.reason);
          isSessionReady = false;
          callbacks.onConnectionChange(false);
        },
      },
    });

    currentSession = session;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    const bufferSize = 4096;
    processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

    processorNode.onaudioprocess = (e) => {
      if (!currentSession || !isSessionReady) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const resampled = resampleTo16kHz(inputData, audioContext!.sampleRate);
      const pcmData = floatTo16BitPCM(resampled);
      const base64Audio = arrayBufferToBase64(pcmData);

      try {
        currentSession.sendRealtimeInput({
          media: {
            data: base64Audio,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      } catch (err) {
        if (!String(err).includes("CLOSING") && !String(err).includes("CLOSED")) {
          console.warn("Error sending audio chunk:", err);
        }
      }
    };

    source.connect(processorNode);
    processorNode.connect(audioContext.destination);
  } catch (error) {
    console.error("Failed to start live session:", error);
    callbacks.onError(
      error instanceof Error ? error : new Error("Failed to start live session")
    );
    throw error;
  }
}

export function stopLiveSession(): void {
  isSessionReady = false;

  if (processorNode) {
    processorNode.disconnect();
    processorNode = null;
  }

  if (audioWorkletNode) {
    audioWorkletNode.disconnect();
    audioWorkletNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (currentSession) {
    try {
      currentSession.close();
    } catch (e) {
      console.warn("Error closing session:", e);
    }
    currentSession = null;
  }
}

export function isLiveSessionActive(): boolean {
  return currentSession !== null;
}
