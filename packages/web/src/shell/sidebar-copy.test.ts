import { describe, expect, it } from "vitest";
import {
  behindCount,
  pendingCount,
  UNKNOWN_COUNT,
  unreadTargetsDetail,
} from "./sidebar-copy";

describe("sidebar counter copy", () => {
  it("counts the behind targets", () => {
    expect(behindCount(1)).toBe("1 behind");
    expect(behindCount(3)).toBe("3 behind");
  });

  it("counts the skills pending on the operator", () => {
    expect(pendingCount(1)).toBe("1 pending");
    expect(pendingCount(3)).toBe("3 pending");
  });

  it("shows a failed read as ? and says Unknown", () => {
    expect(UNKNOWN_COUNT).toEqual({ shown: "?", spoken: "Unknown" });
  });

  it("names each target whose read failed, then the registry read, in the ? tooltip", () => {
    const next = "Select Re-read Deploy-state on the Deploy-state screen.";
    expect(unreadTargetsDetail(["Global"], false)).toBe(
      `Couldn't read Global. ${next}`,
    );
    expect(unreadTargetsDetail(["Global", "…/code/acme-web"], false)).toBe(
      `Couldn't read Global and …/code/acme-web. ${next}`,
    );
    expect(
      unreadTargetsDetail(
        ["Global", "…/clients/acme-corporation-web-platform"],
        true,
      ),
    ).toBe(
      `Couldn't read Global, …/clients/acme-corporation-web-platform and the list of registered repositories. ${next}`,
    );
    expect(unreadTargetsDetail([], true)).toBe(
      `Couldn't read the list of registered repositories. ${next}`,
    );
  });
});
