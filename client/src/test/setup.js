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
