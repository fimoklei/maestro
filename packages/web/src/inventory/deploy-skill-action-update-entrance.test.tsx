// The Inventory's second entrance into the Update preview: a Deploy the target's
// own release cannot serve, answered with the one control that can (#955).
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeploySkillAction } from "./deploy-skill-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

const repos = [{ path: "/projects/alpha" }];

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

// One fetch stub for the whole journey: the refused deploy, the preview it
// routes into, and the confirm. `sent` keeps every body for the assertions.
function stubServer(options?: { deployError?: string }) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (typeof init?.body === "string") {
        sent.push({ url, body: JSON.parse(init.body) });
      }
      if (url === "/api/deploy") {
        return new Response(
          JSON.stringify({
            error: options?.deployError ?? "not-at-target-release",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
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
      return jsonResponse({ tools: [], primitives: [], skipped: [] });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return sent;
}

async function refusedDeploy(options?: { deployError?: string }) {
  const sent = stubServer(options);
  renderWithQuery(
    <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
  );
  await userEvent.click(screen.getByRole("button", { name: /deploy skill/i }));
  await screen.findByRole("alert");
  return sent;
}

describe("DeploySkillAction routing into the Update preview", () => {
  it("offers Update target when the skill needs the newer release", async () => {
    await refusedDeploy();

    expect(
      await screen.findByRole("button", { name: /update target/i }),
    ).toBeInTheDocument();
  });

  // Story 46: a deployed skill the newest release changed needs the same
  // entrance. Without it the row states Behind and offers nothing at all.
  it("offers Update target for a skill deployed here but behind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state?")) {
          return jsonResponse({
            primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
            skipped: [],
            releaseHead: {
              release: "v0.3.2",
              latestRelease: "v0.3.4",
              changed: 1,
              changedSkills: ["tdd"],
              selection: ["tdd"],
              selected: 1,
              comparedAt: "2026-09-12T10:00:00.000Z",
            },
          });
        }
        return jsonResponse({ tools: [], primitives: [], skipped: [] });
      }),
    );
    renderWithQuery(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    expect(
      await screen.findByRole("button", { name: /update target/i }),
    ).toBeInTheDocument();
  });

  it("offers no Update target for a refusal another release cannot clear", async () => {
    await refusedDeploy({ deployError: "local-diverged-from-tag" });

    expect(
      screen.queryByRole("button", { name: /update target/i }),
    ).not.toBeInTheDocument();
  });

  it("prices the update with the skill the reader asked for", async () => {
    const sent = await refusedDeploy();

    await userEvent.click(
      await screen.findByRole("button", { name: /update target/i }),
    );

    expect(await screen.findByText("Added by this deploy")).toBeInTheDocument();
    expect(
      sent.find((call) => call.url === "/api/deploy/update/preflight")?.body,
    ).toStrictEqual({
      target: { kind: "repo", repoPath: "/projects/alpha" },
      add: "tdd",
    });
  });

  it("drops the refusal once the dialog that cleared it closes", async () => {
    await refusedDeploy();

    await userEvent.click(
      await screen.findByRole("button", { name: /update target/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Update target" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update target/i }),
    ).not.toBeInTheDocument();
  });

  it("confirms the release move and the addition as one request", async () => {
    const sent = await refusedDeploy();

    await userEvent.click(
      await screen.findByRole("button", { name: /update target/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Update target" }),
    );

    expect(
      sent.find((call) => call.url === "/api/deploy/update")?.body,
    ).toStrictEqual({
      target: { kind: "repo", repoPath: "/projects/alpha" },
      token: "a".repeat(64),
      add: "tdd",
    });
  });
});
