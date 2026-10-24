import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { RELEASED, row, withStages } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

afterEach(() => {
  vi.unstubAllGlobals();
});

const prompt = {
  type: "prompt",
  path: ".maestro/prompts/pr-check.md",
} as const;

describe("the row the Harness screen is sent to open", () => {
  it("opens the row in the stage it names, not the Pending proposal of the same name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          withStages(RELEASED, {
            proposal: [
              row("pending-proposal", "pr-check", "not-yet-proposed", prompt),
            ],
            release: [
              row("pending-release", "pr-check", "not-yet-released", prompt),
            ],
          }),
        ),
      ),
    );
    renderWithQuery(
      <HarnessView
        openPrimitive={{
          type: "prompt",
          name: "pr-check",
          stage: "pending-release",
        }}
        written={null}
      />,
    );

    const pane = await screen.findByRole("complementary", {
      name: "pr-check detail",
    });
    expect(
      within(pane).getByText("Stage", { selector: "dt" }).nextElementSibling
        ?.textContent,
    ).toBe("Pending release");
  });
});
