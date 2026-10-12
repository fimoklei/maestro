import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { driftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "../inventory/deployed-rollup";
import { renderWithQuery } from "../test-utils";
import { SkillsView } from "./skills-view";

// Band 2 at a phone-width window: 460px leaves the band about 26rem (#1492).
vi.mock("../ui/use-width-rem", () => ({ useWidthRem: () => 26 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const target = (
  name: string,
  drift: DeploymentTarget["drift"],
  copy?: "local-edits",
): DeploymentTarget => ({
  pending: undefined,
  label: "",
  target: { kind: "global" },
  deployed: {
    status: "ready",
    names: [name],
    skippedCount: 0,
    attentionCount: 0,
    followsRelease: false,
  },
  primitives: [{ type: "skill", name, version: "v1.0.0", copy }],
  drift,
});

describe("Skills band 2 at a narrow window", () => {
  it("drops the three counts so the read age stays whole", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    vi.useFakeTimers({ now, toFake: ["Date"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const ran = driftViewModel({ data: { behind: [] }, isError: false });
    renderWithQuery(
      <SkillsView
        primitives={["tdd", "caveman", "brain"].map((name) => ({
          type: "skill",
          name,
          description: "",
        }))}
        repos={[]}
        registryReady
        harness={{ origin: "github.com/acme/harness", latestRelease: "v1.4.0" }}
        reads={[{ at: now.getTime(), failed: false }]}
        targets={[
          target(
            "tdd",
            driftViewModel({
              data: {
                behind: [
                  {
                    name: "tdd",
                    current: "v1.0.0",
                    latest: "v1.1.0",
                    reading: "behind",
                  },
                ],
              },
              isError: false,
            }),
          ),
          target("caveman", ran, "local-edits"),
          target("brain", driftViewModel({ data: undefined, isError: true })),
        ]}
        failure={null}
        reading={false}
        onReread={() => {}}
        clone={{ kind: "checking" }}
        onDeleted={() => {}}
      />,
    );

    expect(screen.getByText("just now")).toBeVisible();
    for (const chip of ["Unknown 1", "Local edits 1", "Behind 1"]) {
      expect(screen.getByText(chip)).toHaveClass("sr-only");
    }
  });
});
