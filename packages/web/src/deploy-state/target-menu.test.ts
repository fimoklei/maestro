import { describe, expect, it } from "vitest";
import { type MenuFacts, targetMenuItems } from "./target-menu";

const IN_SYNC: MenuFacts = {
  behind: false,
  wire: { kind: "repo", repoPath: "/work/app" },
  primitives: [],
};

const menu = (facts: Partial<MenuFacts>, retrying = false) =>
  targetMenuItems({ ...IN_SYNC, ...facts }, retrying).map((item) =>
    item.disabled ? `${item.label} (disabled)` : item.label,
  );

describe("targetMenuItems", () => {
  it("offers only Deploy skill on an In sync target", () => {
    expect(menu({})).toEqual(["Deploy skill"]);
  });

  it("offers Update target on a behind target", () => {
    expect(menu({ behind: true })).toEqual(["Deploy skill", "Update target"]);
  });

  it("offers the retry of the operation that stopped first, and no Update target", () => {
    expect(
      menu({ pending: { kind: "remove", release: "v0.3.4", desired: [] } }),
    ).toEqual(["Retry removal", "Deploy skill"]);
  });

  it("drops the retry while it runs", () => {
    expect(
      menu(
        { pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] } },
        true,
      ),
    ).toEqual(["Deploy skill"]);
  });

  const EDITED: Partial<MenuFacts> = {
    wire: { kind: "repo", repoPath: "/work/app" },
    primitives: [
      { type: "skill", name: "tdd", version: "v1", copy: "local-edits" },
    ],
  };

  it("leads with Import local edits on a repository with Local edits, before Update target", () => {
    expect(menu({ ...EDITED, behind: true })).toEqual([
      "Import local edits",
      "Deploy skill",
      "Update target",
    ]);
  });

  it("offers Import local edits on the global target with Local edits", () => {
    expect(menu({ ...EDITED, wire: { kind: "global" } })).toEqual([
      "Import local edits",
      "Deploy skill",
    ]);
  });

  it("omits Import local edits where no skill reads Local edits", () => {
    expect(
      menu({
        ...EDITED,
        primitives: [
          { type: "skill", name: "tdd", version: "v1", copy: "unverified" },
        ],
      }),
    ).toEqual(["Deploy skill"]);
  });

  it("omits Import local edits on a target with an Unfinished operation", () => {
    expect(
      menu({
        ...EDITED,
        pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] },
      }),
    ).toEqual(["Retry deploy", "Deploy skill"]);
  });
});
