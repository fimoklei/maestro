import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeployStatePanel } from "./deploy-state-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Routes the panel's two queries (deploy-state and drift) by URL, so each
// scenario can pin one deployed skill and a distinct drift outcome.
function stubFetch(
  deployState: unknown,
  drift: unknown,
  { driftStatus = 200, deployStateStatus = 200 } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/drift")) {
        return jsonResponse(drift, driftStatus);
      }
      return jsonResponse(deployState, deployStateStatus);
    }),
  );
}

function renderPanel(repo: string) {
  return renderWithQuery(
    <DeployStatePanel repo={repo} onStartDeploy={() => {}} />,
  );
}

const tddDeployed = {
  primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
  skipped: [],
};

describe("DeployStatePanel drift badge", () => {
  it("shows a behind badge for a skill the check reports behind", async () => {
    stubFetch(tddDeployed, {
      behind: [
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText("Behind")).toBeInTheDocument();
  });

  it("shows the deployed -> latest version pair for a behind skill", async () => {
    stubFetch(tddDeployed, {
      behind: [
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ],
    });
    renderPanel("/Users/me/project");

    expect(
      await screen.findByText(/v0\.5\.0\s*→\s*v0\.5\.1/),
    ).toBeInTheDocument();
  });

  // ADR-0027: the release moved, this skill did not. The row still states the
  // lagging pin and keeps its Update action; the target does not read Behind.
  it("shows an older-tag badge for a skill whose content did not move", async () => {
    stubFetch(tddDeployed, {
      behind: [
        {
          name: "tdd",
          current: "v0.5.0",
          latest: "v0.5.1",
          reading: "older-tag",
        },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("Older tag")).toBeInTheDocument();
    expect(
      await screen.findByText(/v0\.5\.0\s*→\s*v0\.5\.1/),
    ).toBeInTheDocument();
    // The row states the reading and offers nothing: one release moves through
    // the card's own Update target (spec story 12, #954).
    expect(screen.queryByRole("button", { name: /update skill/i })).toBeNull();
    expect(await screen.findByText(/in sync/i)).toBeInTheDocument();
  });

  it("states a skill no longer released without offering an impossible update", async () => {
    stubFetch(tddDeployed, {
      behind: [
        {
          name: "tdd",
          current: "v0.5.0",
          latest: "v0.5.1",
          reading: "no-longer-released",
        },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("No longer released")).toBeInTheDocument();
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update skill/i })).toBeNull();
    expect(screen.getByText("▲ Attention")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /actions for tdd/i }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Remove skill" }),
    ).toBeInTheDocument();
  });

  it("shows up-to-date for a skill the check does not report behind", async () => {
    stubFetch(tddDeployed, { behind: [] });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/up to date/i)).toBeInTheDocument();
  });

  it("shows unknown, never up-to-date, when the check could not run", async () => {
    stubFetch(tddDeployed, { ok: false });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/up to date/i)).not.toBeInTheDocument();
  });

  it("shows unverified, distinct from unknown and never up-to-date, when apm could not reach the source", async () => {
    stubFetch(tddDeployed, { ok: false, reason: "unverified" });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/unverified/i)).toBeInTheDocument();
    expect(screen.queryByText(/up to date/i)).not.toBeInTheDocument();
    // A reachability failure reads as its own state, not the generic "unknown".
    expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
  });

  it("does not mark the target as drift when the only behind primitive is not deployed here", async () => {
    stubFetch(tddDeployed, {
      behind: [
        { name: "foo", current: "v1.0.0", latest: "v1.1.0", reading: "behind" },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText(/in sync/i)).toBeInTheDocument();
    expect(screen.queryByText(/▲ Behind/)).not.toBeInTheDocument();
  });

  it("surfaces a behind name that is not a deployed skill, instead of dropping it", async () => {
    stubFetch(tddDeployed, {
      behind: [
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
        { name: "foo", current: "v1.0.0", latest: "v1.1.0", reading: "behind" },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/not deployed here/i)).toHaveTextContent(
      /foo/,
    );
  });

  it("does not claim in sync when deploy-state could not be read, even if drift reports behind", async () => {
    // Drift says tdd is behind, but the deployed set is unknown (read failed).
    // The header must not silently read "in sync" / hide the update (J04).
    stubFetch(
      tddDeployed,
      {
        behind: [
          {
            name: "tdd",
            current: "v0.5.0",
            latest: "v0.5.1",
            reading: "behind",
          },
        ],
      },
      { deployStateStatus: 500 },
    );
    renderPanel("/Users/me/project");

    expect(
      await screen.findByText(/Deploy-state not read/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/in sync/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/▲ Behind/)).not.toBeInTheDocument();
  });
});
