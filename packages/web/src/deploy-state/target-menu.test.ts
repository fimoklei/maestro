import { describe, expect, it } from "vitest";
import { type MenuFacts, targetMenuItems } from "./target-menu";

const IN_SYNC: MenuFacts = { behind: false };

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
});
