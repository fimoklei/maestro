import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { useInventory, useInventoryOf } from "./use-inventory";

const seen = new Set<Error>();

function PromptFailure() {
  const [renders, setRenders] = useState(0);
  const prompts = useInventoryOf("prompt");
  if (prompts.error) seen.add(prompts.error);
  return (
    <button type="button" onClick={() => setRenders(renders + 1)}>
      Render again
    </button>
  );
}

// The panels mount on a cached read: the Inventory is already in the client.
function OpenPromptsLater() {
  const [open, setOpen] = useState(false);
  const inventory = useInventory();
  if (!inventory.data) return null;
  return open ? (
    <PromptFailure />
  ) : (
    <button type="button" onClick={() => setOpen(true)}>
      Open Prompts
    </button>
  );
}

describe("useInventoryOf", () => {
  // A new failure on every render re-renders its screen without end (#1506).
  it("reports one failure for an unread type, however often its screen renders", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ primitives: [], unreadTypes: ["prompt"] }),
      ),
    );
    renderWithQuery(<OpenPromptsLater />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Open Prompts" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Render again" }),
    );

    expect([...seen].map((error) => error.message)).toEqual([
      "The prompt files of the release were not read.",
    ]);
  });
});
