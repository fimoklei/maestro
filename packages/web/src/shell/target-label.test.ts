import { describe, expect, it } from "vitest";
import { targetLabel } from "./target-label";

describe("targetLabel", () => {
  it("keeps the distinguishing tail for paths sharing a long common prefix", () => {
    const a = targetLabel(
      "/Users/michielmerks/Projects/client-a/agent-harness",
    );
    const b = targetLabel(
      "/Users/michielmerks/Projects/client-b/agent-harness",
    );

    // The prefix truncation this replaces made these byte-identical; the tail
    // is the only part that tells the two clones apart, so it must survive.
    expect(a).not.toBe(b);
    expect(a).toBe("…/client-a/agent-harness");
    expect(b).toBe("…/client-b/agent-harness");
  });

  it("distinguishes two clones of the same repo under different parents", () => {
    expect(targetLabel("/Users/m/Projects/agent-harness")).toBe(
      "…/Projects/agent-harness",
    );
    expect(targetLabel("/Users/m/work/agent-harness")).toBe(
      "…/work/agent-harness",
    );
  });

  it("returns a short path unchanged", () => {
    expect(targetLabel("/tmp")).toBe("/tmp");
    expect(targetLabel("/opt/tools")).toBe("/opt/tools");
  });

  it("ignores a trailing slash when taking the tail", () => {
    expect(targetLabel("/a/b/c/")).toBe("…/b/c");
  });

  it("grows the tail until it is unique among sibling paths", () => {
    // The two clones share their last two segments (repos/agent-harness); a
    // fixed two-segment tail would render both identically — the very failure
    // #211 reports, just relocated. The label must extend to the first segment
    // that tells them apart.
    const a = "/Users/me/clientA/repos/agent-harness";
    const b = "/Users/me/clientB/repos/agent-harness";
    const siblings = [a, b];

    expect(targetLabel(a, siblings)).toBe("…/clientA/repos/agent-harness");
    expect(targetLabel(b, siblings)).toBe("…/clientB/repos/agent-harness");
    expect(targetLabel(a, siblings)).not.toBe(targetLabel(b, siblings));
  });

  it("keeps the two-segment tail when no sibling shares it", () => {
    const a = "/Users/me/work/acme-web";
    const b = "/Users/me/work/acme-api";
    // Same parent, different basename: the two-segment tail already distinguishes.
    expect(targetLabel(a, [a, b])).toBe("…/work/acme-web");
    expect(targetLabel(b, [a, b])).toBe("…/work/acme-api");
  });

  it("falls back to the full path when a sibling shares the whole tail", () => {
    // A shorter clone whose entire path is the tail of a deeper one: no proper
    // shortened suffix is unique, so the full (always-unique) path stands.
    const shallow = "/repos/agent-harness";
    const deep = "/Users/me/repos/agent-harness";
    expect(targetLabel(shallow, [shallow, deep])).toBe("/repos/agent-harness");
    expect(targetLabel(deep, [shallow, deep])).toBe("…/me/repos/agent-harness");
  });
});
