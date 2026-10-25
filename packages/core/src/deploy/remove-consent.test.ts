import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { RemoveConsentIssuer } from "./remove-consent";
import type { RemoveCheck } from "./remove-deployed-skill";

const GLOBAL: DeployTarget = { kind: "global" };
const REPO: DeployTarget = { kind: "repo", repoPath: "/repo" };

function issuer() {
  return new RemoveConsentIssuer({ treeRoot: () => "/home" });
}

describe("RemoveConsentIssuer.offer", () => {
  it.each([
    [GLOBAL, []],
    [GLOBAL, ["codex"]],
    [GLOBAL, ["claude"]],
    [GLOBAL, ["claude", "codex"]],
    [REPO, undefined],
  ] as const)(
    "offers no reclaim on %j with %j detected",
    (target, detected) => {
      expect(issuer().offer({ target, name: "tdd", detected })).toBeNull();
    },
  );
});

describe("RemoveConsentIssuer.grants", () => {
  it("grants nothing for a token a caller merely guessed", () => {
    const scope = { target: GLOBAL, name: "tdd", detected: ["codex"] as const };

    expect(issuer().grants(scope, "a".repeat(64))).toBeNull();
  });
});

describe("RemoveConsentIssuer receipts", () => {
  const scope = { target: GLOBAL, name: "tdd" };

  const CLEAN = {
    scope: "global",
    tools: [
      { tool: "claude", warning: null },
      { tool: "codex", warning: null },
    ],
  } as const satisfies RemoveCheck;
  const UNVERIFIABLE = {
    scope: "global",
    tools: [
      { tool: "claude", warning: "cannot-verify-local-edits" },
      { tool: "codex", warning: null },
    ],
  } as const satisfies RemoveCheck;

  it("accepts back the receipt it minted for the same skill, target and cost", () => {
    const consent = issuer();

    expect(consent.accepts(scope, CLEAN, consent.receipt(scope, CLEAN))).toBe(
      true,
    );
  });

  it("refuses a request that carries no receipt at all", () => {
    expect(issuer().accepts(scope, CLEAN, undefined)).toBe(false);
  });

  it("refuses a receipt a caller merely guessed", () => {
    expect(issuer().accepts(scope, CLEAN, "a".repeat(64))).toBe(false);
  });

  it("refuses a receipt that is not even token-shaped", () => {
    expect(issuer().accepts(scope, CLEAN, "not-hex")).toBe(false);
  });

  it("refuses a token-shaped prefix of the receipt it minted", () => {
    const consent = issuer();

    expect(
      consent.accepts(scope, CLEAN, consent.receipt(scope, CLEAN).slice(0, 8)),
    ).toBe(false);
  });

  it("refuses a receipt minted for a different skill", () => {
    const consent = issuer();

    expect(
      consent.accepts(
        scope,
        CLEAN,
        consent.receipt({ ...scope, name: "jobs" }, CLEAN),
      ),
    ).toBe(false);
  });

  it("refuses a receipt minted for a different target", () => {
    const consent = issuer();

    expect(
      consent.accepts(
        scope,
        CLEAN,
        consent.receipt({ ...scope, target: REPO }, CLEAN),
      ),
    ).toBe(false);
  });

  it("refuses a receipt minted for a cost the copy no longer carries", () => {
    const consent = issuer();

    expect(
      consent.accepts(scope, UNVERIFIABLE, consent.receipt(scope, CLEAN)),
    ).toBe(false);
  });

  it("accepts a receipt whose tools answered in a different order", () => {
    const consent = issuer();
    const reordered: RemoveCheck = {
      scope: "global",
      tools: [...CLEAN.tools].reverse(),
    };

    expect(
      consent.accepts(scope, reordered, consent.receipt(scope, CLEAN)),
    ).toBe(true);
  });

  it("refuses a receipt minted by another instance", () => {
    expect(issuer().accepts(scope, CLEAN, issuer().receipt(scope, CLEAN))).toBe(
      false,
    );
  });
});
