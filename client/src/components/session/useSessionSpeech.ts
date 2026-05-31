import { useEffect, useRef, useState } from "react";
import { getSpeechLanguage, getWhisperLanguage } from "./sessionHelpers";

type UseSessionSpeechParams = {
  language: string;
  onTranscriptCaptured: (transcript: string) => void;
};

type WorkerMessage =
  | { type: "loading_progress"; payload: { status?: string; progress?: number; file?: string } }
  | { type: "ready" }
  | { type: "result"; transcript: string }
  | { type: "error"; message: string };

const MAX_RECORDING_MS = 10_000;
const TARGET_SAMPLE_RATE = 16_000;

async function decodeAndResample(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();

  // Decode with a temporary AudioContext, then immediately close it
  const decodeCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    decodeCtx.close().catch(() => {});
  }

  // Resample to 16 kHz mono via OfflineAudioContext
  const frameCount = Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}

export function useSessionSpeech({ language, onTranscriptCaptured }: UseSessionSpeechParams) {
  const [speechError, setSpeechError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [modelReady, setModelReady] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioLoadingRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const modelLoadingRef = useRef(false);
  const pendingRecordRef = useRef(false);

  const supportsSpeech =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const supportsRecognition =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator?.mediaDevices?.getUserMedia === "function";

  function ensureWorker() {
    if (workerRef.current) return;
    const worker = new Worker(
      new URL("../../workers/whisperWorker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const msg = event.data;

      if (msg.type === "loading_progress") {
        const { status, progress, file } = msg.payload;
        if (status === "download" && typeof progress === "number") {
          setModelLoadProgress(Math.round(progress));
        }
        if (status === "done" && file?.includes("decoder")) {
          setModelLoadProgress(90);
        }
      }

      if (msg.type === "ready") {
        modelLoadingRef.current = false;
        setModelLoading(false);
        setModelLoadProgress(100);
        setModelReady(true);
        if (pendingRecordRef.current) {
          pendingRecordRef.current = false;
          doStartRecording();
        }
      }

      if (msg.type === "result") {
        setIsTranscribing(false);
        setSpeechError("");
        onTranscriptCaptured(msg.transcript);
      }

      if (msg.type === "error") {
        setIsTranscribing(false);
        setSpeechError(msg.message);
      }
    };
    worker.onerror = () => {
      setIsTranscribing(false);
      setModelLoading(false);
      modelLoadingRef.current = false;
      setSpeechError("Speech recognition failed to load. Please refresh and try again.");
    };
    workerRef.current = worker;
  }

  function loadModel() {
    if (modelLoadingRef.current || modelReady) return;
    modelLoadingRef.current = true;
    setModelLoading(true);
    setModelLoadProgress(0);
    ensureWorker();
    workerRef.current!.postMessage({ type: "load" });
  }

  async function doStartRecording() {
    if (isRecording) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSpeechError("Microphone access was denied. Please allow microphone permission and try again.");
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);

      if (chunks.length === 0) {
        setSpeechError("Nothing recorded. Please try again.");
        return;
      }

      setIsTranscribing(true);
      setSpeechError("");

      try {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const audio = await decodeAndResample(blob);
        workerRef.current?.postMessage(
          { type: "transcribe", audio, language: getWhisperLanguage(language) },
          [audio.buffer]
        );
      } catch {
        setIsTranscribing(false);
        setSpeechError("Could not process audio. Please try again.");
      }
    };

    recorder.start();
    setIsRecording(true);
    setSpeechError("");

    // Auto-stop after max duration
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_RECORDING_MS);
  }

  function startPronunciationCheck() {
    if (isRecording || isTranscribing) return;

    if (!modelReady) {
      pendingRecordRef.current = true;
      loadModel();
      return;
    }

    doStartRecording();
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  useEffect(() => {
    return () => {
      if (supportsSpeech) window.speechSynthesis.cancel();
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      mediaRecorderRef.current?.stop();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [supportsSpeech]);

  async function playAudioUrl(url: string, playbackRate = 1) {
    if (typeof window === "undefined" || !window.AudioContext) {
      setSpeechError("Web Audio is not supported in this browser.");
      return;
    }
    if (audioLoadingRef.current) return;
    audioLoadingRef.current = true;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
      }
      const audioContext = audioContextRef.current;
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = Number.isFinite(playbackRate) ? playbackRate : 1;
      source.connect(audioContext.destination);
      source.start();
      setSpeechError("");
    } catch {
      setSpeechError("Could not play this audio clip.");
    } finally {
      audioLoadingRef.current = false;
    }
  }

  function speakText(text: string, rate = 0.95) {
    if (!supportsSpeech) {
      setSpeechError("Speech is not supported in this browser.");
      return;
    }
    // Slash-separated alternatives (e.g. "word1 / word2 / word3") should be read as a
    // short pause between words, not as the literal word "slash".
    const spokenText = text.replace(/\s*\/\s*/g, ", ");
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = getSpeechLanguage(language);
    utterance.rate = Number.isFinite(rate) ? rate : 0.95;
    utterance.onstart = () => setSpeechError("");
    utterance.onerror = (event) => {
      const code = (event as SpeechSynthesisErrorEvent)?.error;
      if (code === "canceled" || code === "interrupted") return;
      setSpeechError("Could not play this audio hint.");
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return {
    speechError,
    setSpeechError,
    supportsSpeech,
    supportsRecognition,
    isRecording,
    isTranscribing,
    modelLoading,
    modelLoadProgress,
    modelReady,
    playAudioUrl,
    speakText,
    startPronunciationCheck,
    stopRecording,
  };
}
