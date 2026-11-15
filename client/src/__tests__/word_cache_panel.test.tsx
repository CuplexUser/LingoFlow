import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getLanguages = vi.fn();
const getWordTranslationCounts = vi.fn();
const prefetchWordTranslations = vi.fn();
const rebuildWordTranslations = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ApiError: actual.ApiError,
    api: {
      getLanguages: (...args: unknown[]) => getLanguages(...args),
      getWordTranslationCounts: (...args: unknown[]) => getWordTranslationCounts(...args),
      prefetchWordTranslations: (...args: unknown[]) => prefetchWordTranslations(...args),
      rebuildWordTranslations: (...args: unknown[]) => rebuildWordTranslations(...args)
    }
  };
});

import { ApiError } from "../api";
import { AdminPage } from "../components/AdminPage";

function renderWordCache() {
  render(
    <AdminPage
      canModerate
      activeCourseLanguage="russian"
      courseCategories={[]}
      onLoadContributions={async () => ({ items: [], total: 0 }) as never}
      onUpdateContributionStatus={async () => ({})}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Word Cache" }));
}

describe("Word Cache pre-translation", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getLanguages.mockResolvedValue([
      { id: "english", label: "English" },
      { id: "spanish", label: "Spanish" },
      { id: "russian", label: "Russian" }
    ]);
    getWordTranslationCounts.mockResolvedValue({ libretranslate: 33, content: 900, total: 933, misses: 7 });
    prefetchWordTranslations.mockReset();
    rebuildWordTranslations.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("walks the course in chunks, retrying while LibreTranslate starts", async () => {
    prefetchWordTranslations
      .mockRejectedValueOnce(new ApiError("LibreTranslate didn't answer in time", 503, "UNAVAILABLE"))
      .mockResolvedValueOnce({ total: 250, cursor: 120, done: false, checked: 100, translated: 90, remaining: 60 })
      .mockResolvedValueOnce({ total: 250, cursor: 250, done: true, checked: 60, translated: 50, remaining: 0 });

    renderWordCache();
    const select = await screen.findByLabelText("Course to pre-translate");
    await waitFor(() => expect(screen.queryByRole("option", { name: "English" })).not.toBeInTheDocument());
    expect(select).toHaveValue("russian");

    fireEvent.click(screen.getByRole("button", { name: "Pre-translate Russian" }));
    expect(await screen.findByText("Waiting for LibreTranslate to start…")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText(/Done: 140 of 160 missing words translated/)).toBeInTheDocument();
    expect(prefetchWordTranslations.mock.calls).toEqual([
      ["russian", 0],
      ["russian", 0],
      ["russian", 120]
    ]);
    await waitFor(() => expect(getWordTranslationCounts).toHaveBeenCalledTimes(2));
  });

  it("stops on an error the server won't recover from", async () => {
    prefetchWordTranslations.mockRejectedValueOnce(
      new ApiError("LibreTranslate has no swedish model", 400, "NO_MODEL")
    );
    renderWordCache();
    fireEvent.click(await screen.findByRole("button", { name: "Pre-translate Russian" }));
    expect(await screen.findByText("LibreTranslate has no swedish model")).toBeInTheDocument();
    expect(prefetchWordTranslations).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pre-translate Russian" })).toBeEnabled();
  });

  it("rebuilds content without touching LibreTranslate rows, and clears everything only after a confirm", async () => {
    rebuildWordTranslations.mockResolvedValue({ rebuilt: 900 });
    renderWordCache();
    expect(await screen.findByText(/7 skipped as untranslatable/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rebuild content translations" }));
    expect(await screen.findByText(/LibreTranslate translations were kept/)).toBeInTheDocument();
    expect(rebuildWordTranslations).toHaveBeenLastCalledWith("content");

    fireEvent.click(screen.getByRole("button", { name: "Clear the whole cache…" }));
    expect(rebuildWordTranslations).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, clear everything" }));
    expect(await screen.findByText(/Cache cleared/)).toBeInTheDocument();
    expect(rebuildWordTranslations).toHaveBeenLastCalledWith("all");
  });
});
