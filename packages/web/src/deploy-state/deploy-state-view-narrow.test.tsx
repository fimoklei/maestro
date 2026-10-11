import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cellsOf,
  renderDeployState,
  stubServer,
} from "./deploy-state-test-helpers";

// Band 2 at a phone-width window: 460px leaves the band about 26rem (#1492).
vi.mock("../ui/use-width-rem", () => ({ useWidthRem: () => 26 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Deploy-state band 2 at a narrow window", () => {
  it("drops the counts so the read age stays whole", async () => {
    stubServer(() => ({
      repos: ["/Users/me/project"],
      repo: {
        "/Users/me/project": {
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
          skipped: [],
        },
      },
      drift: { "/Users/me/project": { ok: false } },
    }));
    renderDeployState();

    await waitFor(() => expect(cellsOf("…/me/project")[1]).toBe("Unknown"));
    expect(await screen.findByText("just now")).toBeVisible();
    expect(screen.getByText("Unknown 1")).toHaveClass("sr-only");
  });
});
