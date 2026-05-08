import { AutoProcessor, WhisperForConditionalGeneration, env } from "@huggingface/transformers";

env.useBrowserCache = true;

const MODEL_ID = "onnx-community/whisper-base";
const MAX_NEW_TOKENS = 128;

type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
// from_pretrained returns PreTrainedModel; cast is safe since we know the model class
type Model = WhisperForConditionalGeneration;

let processor: Processor | null = null;
let model: Model | null = null;

function onProgress(progress: Record<string, unknown>) {
  self.postMessage({ type: "loading_progress", payload: progress });
}

async function loadModel() {
  const hasWebGPU =
    typeof navigator !== "undefined" && "gpu" in navigator && navigator.gpu !== null;

  processor = await AutoProcessor.from_pretrained(MODEL_ID, {
    progress_callback: onProgress,
  });

  if (hasWebGPU) {
    try {
      model = (await WhisperForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" } as never,
        device: "webgpu",
        progress_callback: onProgress,
      })) as Model;
      return;
    } catch {
      // WebGPU init failed — fall through to WASM
    }
  }

  model = (await WhisperForConditionalGeneration.from_pretrained(MODEL_ID, {
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" } as never,
    device: "wasm",
    progress_callback: onProgress,
  })) as Model;
}

async function transcribeAudio(audio: Float32Array, language: string): Promise<string> {
  if (!processor || !model) throw new Error("Model not loaded");

  const inputs = await processor(audio);

  const outputs = await model.generate({
    ...(inputs as Record<string, unknown>),
    max_new_tokens: MAX_NEW_TOKENS,
    language,
    task: "transcribe",
  } as never);

  const decoded = (processor as unknown as {
    batch_decode: (ids: unknown, opts: { skip_special_tokens: boolean }) => string[];
  }).batch_decode(outputs, { skip_special_tokens: true });

  return (Array.isArray(decoded) ? decoded[0] : decoded) ?? "";
}

self.addEventListener("message", async (event: MessageEvent<{ type: string; audio?: Float32Array; language?: string }>) => {
  const { type } = event.data;

  if (type === "load") {
    try {
      await loadModel();
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err) });
    }
    return;
  }

  if (type === "transcribe") {
    try {
      const { audio, language } = event.data;
      if (!audio || !language) throw new Error("Missing audio or language");
      const transcript = await transcribeAudio(audio, language);
      self.postMessage({ type: "result", transcript: transcript.trim() });
    } catch (err) {
      self.postMessage({ type: "error", message: "Transcription failed. Please try again." });
      console.error("[whisperWorker] transcribe error:", err);
    }
    return;
  }
});
