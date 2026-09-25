// The Inventory's second entrance into the Update preview (#955, #937): a
// deploy the target's own release cannot serve, answered from the Report with
// the one control that can. Successor of the retired DeploySkillAction's
// entrance test (#1065).
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BulkDeployAction } from "./bulk-deploy-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PREVIEW = {
  release: "v0.3.2",
  chosenRelease: "v0.3.4",
  counts: { changed: 1, removed: 0, unchanged: 1 },
  addedByThisDeploy: [{ name: "tdd", url: null }],
  changed: [{ name: "grill", url: null }],
  removed: [],
  unchanged: ["brief"],
  newInRelease: [],
  localEdits: { discard: [], unverified: [] },
  selection: {
    current: ["grill", "brief"],
    desired: ["grill", "brief", "tdd"],
  },
  copyReceipt: null,
  token: "a".repeat(64),
};

// One stub for the whole journey: the reads, the refused run, the preview it
// routes into, and the confirm. `sent` keeps every body for the assertions.
function stubServer(attentionError: string) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (typeof init?.body === "string") {
        sent.push({ url, body: JSON.parse(init.body) });
      }
      if (url.startsWith("/api/drift")) return jsonResponse({ behind: [] });
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse({ tools: [], skipped: [] });
      }
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] });
      }
      if (url === "/api/deploy/bulk") {
        return jsonResponse({
          target: { kind: "repo", repoPath: "/projects/alpha" },
          deployed: [],
          attention: [{ name: "tdd", error: attentionError, forceable: false }],
          failed: [],
        });
      }
      if (url === "/api/deploy/update/preflight") {
        return jsonResponse({ preview: PREVIEW });
      }
      if (url === "/api/deploy/update") {
        return jsonResponse({
          release: "v0.3.4",
          outcome: [{ name: "tdd", tool: null, state: "updated" }],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  return sent;
}

async function refusedDeploy(attentionError = "not-at-target-release") {
  const sent = stubServer(attentionError);
  renderWithQuery(
    <BulkDeployAction
      stagedNames={["tdd"]}
      repos={[{ path: "/projects/alpha" }]}
      registryReady
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Deploy skills" }));
  const dialog = screen.getByRole("dialog");
  const button = within(dialog).getByRole("button", {
    name: /deploy skill|loading targets/i,
  });
  await vi.waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await within(dialog).findByRole("heading", { level: 3 });
  return sent;
}

describe("BulkDeployAction routing into the Update preview", () => {
  it("offers Update target when the skill needs the newer release", async () => {
    await refusedDeploy();

    expect(
      screen.getByRole("button", { name: "Update target" }),
    ).toBeInTheDocument();
  });

  it("offers no Update target for a refusal another release cannot clear", async () => {
    await refusedDeploy("target-pinned-per-skill");

    expect(
      screen.queryByRole("button", { name: "Update target" }),
    ).not.toBeInTheDocument();
  });

  it("prices the update with the skill the reader asked for", async () => {
    const sent = await refusedDeploy();

    await userEvent.click(
      screen.getByRole("button", { name: "Update target" }),
    );

    expect(await screen.findByText("Added by this deploy")).toBeInTheDocument();
    expect(
      sent.find((call) => call.url === "/api/deploy/update/preflight")?.body,
    ).toStrictEqual({
      target: { kind: "repo", repoPath: "/projects/alpha" },
      add: "tdd",
    });
  });

  it("confirms the release move and the addition as one request", async () => {
    const sent = await refusedDeploy();

    await userEvent.click(
      screen.getByRole("button", { name: "Update target" }),
    );
    const update = await screen.findByRole("dialog", { name: /update/i });
    await userEvent.click(
      await within(update).findByRole("button", { name: "Update target" }),
    );

    await vi.waitFor(() =>
      expect(
        sent.find((call) => call.url === "/api/deploy/update")?.body,
      ).toStrictEqual({
        target: { kind: "repo", repoPath: "/projects/alpha" },
        token: "a".repeat(64),
        add: "tdd",
      }),
    );
  });

  it("closes the whole flow once the dialog that cleared the refusal closes", async () => {
    await refusedDeploy();

    await userEvent.click(
      screen.getByRole("button", { name: "Update target" }),
    );
    const update = await screen.findByRole("dialog", { name: /update/i });
    await userEvent.click(
      await within(update).findByRole("button", { name: "Update target" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
