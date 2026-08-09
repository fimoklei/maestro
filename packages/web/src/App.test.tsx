import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { jsonResponse, renderWithQuery } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  return renderWithQuery(<App />);
}

describe("App", () => {
  it("renders the cockpit shell and lands on Deploy-state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        ),
      ),
    );
    renderApp();

    // The status bar reflects the live server connection…
    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
    // …and the landing route is Deploy-state.
    expect(
      screen.getByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });
});
