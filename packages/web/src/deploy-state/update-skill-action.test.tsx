import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeployStatePanel } from "./deploy-state-panel";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Routes the panel's two read queries (deploy-state and drift) by URL, so each
// scenario can pin one deployed skill and a distinct drift outcome. The deploy
// POST is handled by the caller's own stub where a click is exercised.
function stubReads(deployState: unknown, drift: unknown, driftStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/drift")) {
        return jsonResponse(drift, driftStatus);
      }
      return jsonResponse(deployState, 200);
    }),
  );
}

function renderPanel(repo: string) {
  return renderWithQuery(
    <DeployStatePanel repo={repo} onStartDeploy={() => {}} />,
  );
}

function renderGlobalPanel() {
  return renderWithQuery(<GlobalDeployStatePanel onStartDeploy={() => {}} />);
}

const tddDeployed = {
  primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
  skipped: [],
};

describe("Update action on a behind skill", () => {
  it("offers an Update action for a skill the check reports behind", async () => {
    stubReads(tddDeployed, {
      behind: [
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ],
    });
    renderPanel("/Users/me/project");

    expect(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    ).toBeInTheDocument();
  });

  it("labels the action alone, and names the skill only to a screen reader", async () => {
    // The row already prints the skill name three cells to the left, so the
    // visible label must not repeat it — while the accessible name still must,
    // since a screen reader reads the button out of that context.
    stubReads(tddDeployed, {
      behind: [
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ],
    });
    renderPanel("/Users/me/project");

    const update = await screen.findByRole("button", {
      name: /update skill tdd/i,
    });
    expect(update).toHaveTextContent("Update skill");
    expect(update.textContent).not.toMatch(/tdd/);
  });

  it("states the action alone while an update is in flight too", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        // Never resolves: the pending label is the one under test.
        return new Promise<Response>(() => undefined);
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    const pending = await screen.findByRole("button", {
      name: /updating skill tdd/i,
    });
    expect(pending).toHaveTextContent("Updating skill…");
    expect(pending.textContent).not.toMatch(/tdd/);
  });

  it("offers no Update action for an up-to-date skill", async () => {
    stubReads(tddDeployed, { behind: [] });
    renderPanel("/Users/me/project");

    expect(await screen.findByText(/up to date/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update skill tdd/i }),
    ).not.toBeInTheDocument();
  });

  it("offers no Update action when the drift check could not run (unknown)", async () => {
    // J04 cardinal rule: an unknown skill is never treated as actionable.
    stubReads(tddDeployed, { ok: false });
    renderPanel("/Users/me/project");

    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update skill tdd/i }),
    ).not.toBeInTheDocument();
  });

  it("offers no Update action while the drift check is still pending", async () => {
    // deploy-state resolves; drift never does, so the badge stays pending and
    // the row must not yet offer an Update.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/drift")) {
          return new Promise<Response>(() => undefined);
        }
        return jsonResponse(tddDeployed, 200);
      }),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update skill tdd/i }),
    ).not.toBeInTheDocument();
  });

  it("updates a behind skill against its repo on click", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        return jsonResponse({
          deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
        });
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    const deployCall = fetchMock.mock.calls.find(
      ([url]) =>
        String(url).startsWith("/api/deploy") &&
        !String(url).includes("deploy-state"),
    ) as unknown as [string, RequestInit];
    expect(deployCall[0]).toBe("/api/deploy");
    expect(deployCall[1].method).toBe("POST");
    expect(JSON.parse(deployCall[1].body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: "/Users/me/project" },
    });
  });

  it("updates a behind skill globally on click in the Global panel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        return jsonResponse({
          deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
        });
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(
        {
          tools: [{ tool: "claude", primitives: tddDeployed.primitives }],
          skipped: [],
        },
        200,
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderGlobalPanel();

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    const deployCall = fetchMock.mock.calls.find(
      ([url]) =>
        String(url).startsWith("/api/deploy") &&
        !String(url).includes("deploy-state"),
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(deployCall[1].body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });
  });

  it("disables the Update action while an update is in flight", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        // Never resolves: the update stays pending for the rest of the test.
        return new Promise<Response>(() => undefined);
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    expect(
      await screen.findByRole("button", { name: /updating skill tdd/i }),
    ).toBeDisabled();
  });

  it("surfaces the server's message when an update is refused", async () => {
    // The deploy use-case refuses a diverged local copy with an actionable
    // tag-and-push message (inherited from deploy); show it, not a generic line.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        return new Response(
          JSON.stringify({
            error: "local-diverged-from-tag",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Publish a release, then deploy again/i,
    );
  });

  it("offers an inline Reinstall-fresh confirm when the copy cannot be proven clean", async () => {
    // ADR-0006: a not-proven-clean deployed copy is confirm-and-proceed, not a
    // dead end. The refusal carries its distinct message and an inline button —
    // not a terminal handoff (#66).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        return new Response(
          JSON.stringify({
            error: "deployed-diverged-from-lock",
            message:
              "Those edits never went through the harness. Reinstalling replaces the copy with the latest published tag.",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /never went through the harness/i,
    );
    expect(
      await screen.findByRole("button", { name: "Deploy again" }),
    ).toBeInTheDocument();
  });

  it("confirming the reinstall re-runs the update with the server's receipt", async () => {
    // Clicking the inline button re-runs the same deploy carrying the receipt
    // the refusal minted — the deliberate, content-bound consent that clears
    // the destination guard (#66, #952).
    let deployCalls = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
          deployCalls += 1;
          if (deployCalls === 1) {
            return new Response(
              JSON.stringify({
                error: "deployed-diverged-from-lock",
                copyReceipt:
                  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                message:
                  "Those edits never went through the harness. Reinstalling replaces the copy with the latest published tag.",
              }),
              { status: 409, headers: { "content-type": "application/json" } },
            );
          }
          return jsonResponse({
            deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
          });
        }
        if (url.includes("/api/drift")) {
          return jsonResponse({
            behind: [
              {
                name: "tdd",
                current: "v0.5.0",
                latest: "v0.5.1",
                reading: "behind",
              },
            ],
          });
        }
        return jsonResponse(tddDeployed, 200);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Deploy again" }),
    );

    const deployBodies = fetchMock.mock.calls
      .filter(
        ([url]) =>
          String(url).startsWith("/api/deploy") &&
          !String(url).includes("deploy-state"),
      )
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(deployBodies).toHaveLength(2);
    expect(deployBodies[1]).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: "/Users/me/project" },
      confirmedCopyReceipt:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
  });

  it("flips the row from behind to up-to-date after a successful update", async () => {
    // The update invalidates the drift query; the refetch reports nothing
    // behind, so the row flips to up-to-date with no manual reload.
    let updated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        updated = true;
        return jsonResponse({
          deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
        });
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: updated
            ? []
            : [
                {
                  name: "tdd",
                  current: "v0.5.0",
                  latest: "v0.5.1",
                  reading: "behind",
                },
              ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    expect(await screen.findByText(/up to date/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /update skill tdd/i }),
    ).not.toBeInTheDocument();
  });

  it("offers no Reinstall button on a tag-and-push refusal", async () => {
    // local-diverged-from-tag is a source problem the user fixes centrally —
    // force would not help, so no reinstall affordance is offered (#66).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        return new Response(
          JSON.stringify({
            error: "local-diverged-from-tag",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/drift")) {
        return jsonResponse({
          behind: [
            {
              name: "tdd",
              current: "v0.5.0",
              latest: "v0.5.1",
              reading: "behind",
            },
          ],
        });
      }
      return jsonResponse(tddDeployed, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: /update skill tdd/i }),
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deploy again" }),
    ).not.toBeInTheDocument();
  });
});
