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

    // The frame stands — sidebar plus the landing screen's own panel (#991).
    expect(
      await screen.findByRole("complementary", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Deploy-state" }),
    ).toBeInTheDocument();
  });
});
