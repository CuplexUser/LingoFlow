import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import React from "react";

vi.mock("react-chartjs-2", () => ({
  Line: (props) => React.createElement("div", { "data-testid": "chart-line", "data-chart-props": JSON.stringify(Boolean(props?.data)) }),
  Bar: (props) => React.createElement("div", { "data-testid": "chart-bar", "data-chart-props": JSON.stringify(Boolean(props?.data)) }),
  Radar: (props) => React.createElement("div", { "data-testid": "chart-radar", "data-chart-props": JSON.stringify(Boolean(props?.data)) }),
  Doughnut: (props) => React.createElement("div", { "data-testid": "chart-doughnut", "data-chart-props": JSON.stringify(Boolean(props?.data)) })
}));

const storage = new Map();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(String(key), String(value));
    },
    removeItem(key) {
      storage.delete(String(key));
    },
    clear() {
      storage.clear();
    }
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/learn");
});

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  });
}

// ── Web Worker mock ──────────────────────────────────────────────────────────
class MockWorker {
  static _nextTranscript = "";
  onmessage = null;
  onerror = null;

  postMessage(data) {
    if (data?.type === "load") {
      Promise.resolve().then(() => this.onmessage?.({ data: { type: "ready" } }));
    } else if (data?.type === "transcribe") {
      const transcript = MockWorker._nextTranscript;
      Promise.resolve().then(() => this.onmessage?.({ data: { type: "result", transcript } }));
    }
  }

  terminate() {}
}

if (typeof Worker === "undefined") {
  global.Worker = MockWorker;
  window.MockWorker = MockWorker;
}

// ── MediaRecorder mock ────────────────────────────────────────────────────────
class MockMediaRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable = null;
  onstop = null;

  start() {
    this.state = "recording";
    Promise.resolve().then(() => {
      this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
      this.state = "inactive";
      this.onstop?.();
    });
  }

  stop() {
    if (this.state === "recording") {
      this.state = "inactive";
      this.onstop?.();
    }
  }
}

if (typeof MediaRecorder === "undefined") {
  global.MediaRecorder = MockMediaRecorder;
}

// ── getUserMedia mock ─────────────────────────────────────────────────────────
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
}
if (!navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop: () => {} }] });
}

// ── AudioContext / OfflineAudioContext mocks ──────────────────────────────────
const _fakeAudioBuffer = { duration: 0.5, getChannelData: () => new Float32Array(8000) };

if (!window.AudioContext) {
  window.AudioContext = class {
    close() { return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve(_fakeAudioBuffer); }
  };
}

if (!window.OfflineAudioContext) {
  window.OfflineAudioContext = class {
    createBufferSource() { return { buffer: null, connect: () => {}, start: () => {} }; }
    get destination() { return {}; }
    startRendering() { return Promise.resolve(_fakeAudioBuffer); }
  };
}

if (!window.speechSynthesis) {
  window.speechSynthesis = {
    cancel: () => {},
    speak: () => {}
  };
}

if (!window.SpeechSynthesisUtterance) {
  window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
    this.text = text;
  };
}
