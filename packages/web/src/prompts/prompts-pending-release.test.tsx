import type { HarnessState, InventoryPrimitive } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenPrimitive } from "../harness/harness-route";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { PromptsPanel } from "./prompts-panel";

const prompt = (
  name: string,
  pendingRelease: InventoryPrimitive["pendingRelease"],
) =>
  ({
    type: "prompt",
    name,
    description: "",
    path: `.maestro/prompts/${name}.md`,
    pendingRelease,
    text: "Review it.\n",
    nameValid: true,
  }) satisfies InventoryPrimitive;

const HARNESS = {
  origin: "github.com/acme/harness",
  releasedVersion: "v1.4.0",
} satisfies Partial<HarnessState>;

afterEach(() => {
  vi.unstubAllGlobals();
});

// Stands in for the Harness screen: names the row it was asked to open.
function HarnessProbe() {
  const state = useLocation().state as {
    openPrimitive?: OpenPrimitive;
  } | null;
  const open = state?.openPrimitive;
  return (
    <p>
      harness opens {open?.stage} {open?.type} {open?.name}
    </p>
  );
}

function renderPanel(primitives: readonly InventoryPrimitive[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/harness") return jsonResponse(HARNESS);
      if (url === "/api/harness/primitive/delete/check")
        return jsonResponse({ skill: {}, prompt: {} });
      return jsonResponse({ primitives });
    }),
  );
  return renderWithQuery(
    <MemoryRouter initialEntries={["/inventory/prompts"]}>
      <Routes>
        <Route path="/inventory/prompts" element={<PromptsPanel />} />
        <Route path="/harness" element={<HarnessProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openPane(name: string) {
  await userEvent.click(
    await within(await screen.findByRole("grid")).findByRole("gridcell", {
      name,
    }),
  );
  return within(await screen.findByRole("complementary"));
}

const factsOf = (pane: { getAllByRole: (role: "term") => HTMLElement[] }) =>
  pane
    .getAllByRole("term")
    .map((term) => [term.textContent, term.nextElementSibling?.textContent]);

describe("a prompt whose merged change waits for a release", () => {
  it("shows Stage and Change, then links the Harness screen to its Pending release row", async () => {
    renderPanel([
      prompt("pr-review", {
        change: "edit",
        renamedTo: null,
        defaultBranch: "main",
      }),
    ]);
    const pane = await openPane("pr-review");

    await waitFor(() =>
      expect(factsOf(pane)).toEqual([
        ["Type", "Prompt"],
        ["Stage", "Pending release"],
        ["Change", "Changed"],
        ["Latest release", "v1.4.0"],
        ["Path", ".maestro/prompts/pr-review.md"],
      ]),
    );
    expect(
      pane.getByText(
        sentence(
          "Select Create a release on the Harness screen to publish the change.",
        ),
      ),
    ).toBeInTheDocument();

    await userEvent.click(pane.getByRole("link", { name: "Harness screen" }));

    expect(
      await screen.findByText("harness opens pending-release prompt pr-review"),
    ).toBeInTheDocument();
  });

  it("reads Deleted and asks to publish the deletion", async () => {
    renderPanel([
      prompt("standup", {
        change: "deletion",
        renamedTo: null,
        defaultBranch: "main",
      }),
    ]);
    const pane = await openPane("standup");

    expect(factsOf(pane)).toContainEqual(["Change", "Deleted"]);
    expect(
      pane.getByText(
        sentence(
          "Select Create a release on the Harness screen to publish the deletion.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("names the new name and branch for a rename, and opens the row under the new name", async () => {
    renderPanel([
      prompt("pr-review", {
        change: "rename",
        renamedTo: "pr-check",
        defaultBranch: "trunk",
      }),
    ]);
    const pane = await openPane("pr-review");

    expect(factsOf(pane)).toContainEqual(["Change", "Renamed"]);
    expect(
      pane.getByText(
        sentence(
          "This prompt was renamed to pr-check on trunk. Select Create a release on the Harness screen to publish it.",
        ),
      ),
    ).toBeInTheDocument();

    await userEvent.click(pane.getByRole("link", { name: "Harness screen" }));

    expect(
      await screen.findByText("harness opens pending-release prompt pr-check"),
    ).toBeInTheDocument();
  });

  it("shows no Stage, Change or Harness link while nothing waits", async () => {
    renderPanel([prompt("pr-review", null)]);
    const pane = await openPane("pr-review");

    expect(pane.queryByText("Stage")).toBeNull();
    expect(pane.queryByText("Change")).toBeNull();
    expect(pane.queryByRole("link", { name: "Harness screen" })).toBeNull();
  });
});
