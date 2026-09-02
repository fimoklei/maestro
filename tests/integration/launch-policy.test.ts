import { describe, expect, it } from "vitest";
import { launchPolicy } from "../../scripts/launch-policy.mjs";

describe("launchPolicy", () => {
  it("keeps the single-instance steps and the detached group on darwin", () => {
    expect(launchPolicy("darwin")).toEqual({
      singleInstance: true,
      detached: true,
    });
  });

  it("drops both on win32, where lsof, ps and process groups do not exist", () => {
    expect(launchPolicy("win32")).toEqual({
      singleInstance: false,
      detached: false,
    });
  });

  it("treats linux like darwin", () => {
    expect(launchPolicy("linux")).toEqual({
      singleInstance: true,
      detached: true,
    });
  });
});
