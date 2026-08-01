import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { RemoveConsentIssuer } from "./remove-consent";

const GLOBAL: DeployTarget = { kind: "global" };
const REPO: DeployTarget = { kind: "repo", repoPath: "/repo" };

function issuer(treeRoot: (target: DeployTarget) => string = () => "/home") {
  return new RemoveConsentIssuer({ treeRoot });
}

describe("RemoveConsentIssuer.offer", () => {
  it("names the leftover tool and the absolute path a removal would delete", () => {
    const offer = issuer().offer({
      target: GLOBAL,
      name: "tdd",
      detected: ["codex"],
    });

    expect(offer?.previews).toEqual([
      { tool: "claude", path: "/home/.claude/skills/tdd" },
    ]);
    expect(offer?.token).toEqual(expect.any(String));
  });

  it("offers nothing when every exclusive tool is still detected", () => {
    expect(
      issuer().offer({
        target: GLOBAL,
        name: "tdd",
        detected: ["claude", "codex"],
      }),
    ).toBeNull();
  });

  it("offers nothing on the per-repo path, whose targets are the repo's own", () => {
    expect(
      issuer().offer({ target: REPO, name: "tdd", detected: undefined }),
    ).toBeNull();
  });

  it("keeps a skills directory several tools read, even when its tool is gone", () => {
    // Codex is undetected, but nine other apm targets deploy under .agents, so
    // its absence proves nothing about the copy (#202).
    expect(
      issuer().offer({ target: GLOBAL, name: "tdd", detected: ["claude"] }),
    ).toBeNull();
  });

  it("drops a leftover it cannot build a path for, rather than guessing one", () => {
    const offer = issuer(() => {
      throw new Error("HOME unreadable");
    }).offer({ target: GLOBAL, name: "tdd", detected: ["codex"] });

    expect(offer).toBeNull();
  });
});

// The token exists so `execute` can prove the confirmation the user saw came
// from this same server's own preflight, over exactly the paths it named. A
// client-supplied path list would authorize a reclaim a caller merely guessed.
describe("RemoveConsentIssuer.grants", () => {
  const scope = {
    target: GLOBAL,
    name: "tdd",
    detected: ["codex"] as const,
  };

  it("grants exactly the paths it named, so the deletion cannot exceed them", () => {
    const consent = issuer();
    const offer = consent.offer(scope);

    // The granted set is handed back rather than a yes/no: the caller deletes
    // this, never a set it derives a second time and that could drift.
    expect(consent.grants(scope, offer?.token)).toEqual(offer?.previews);
  });

  it("refuses a request that carries no token at all", () => {
    expect(issuer().grants(scope, undefined)).toBeNull();
  });

  it("refuses a token a caller merely guessed", () => {
    expect(issuer().grants(scope, "a".repeat(64))).toBeNull();
  });

  it("refuses a token that is not even token-shaped", () => {
    expect(issuer().grants(scope, "not-hex")).toBeNull();
  });

  it("refuses a token issued for a different machine state", () => {
    const consent = issuer();
    const offer = consent.offer({ ...scope, detected: ["claude"] });

    // Claude was detected then and is gone now, so the paths differ.
    expect(consent.grants(scope, offer?.token)).toBeNull();
  });

  it("refuses a token issued for a different skill", () => {
    const consent = issuer();
    const offer = consent.offer({ ...scope, name: "jobs" });

    expect(consent.grants(scope, offer?.token)).toBeNull();
  });

  it("refuses a token issued by another instance", () => {
    // The key never leaves the process, so a token can only exist because this
    // instance's own preflight issued it.
    const offer = issuer().offer(scope);

    expect(issuer().grants(scope, offer?.token)).toBeNull();
  });

  it("refuses any token when there is nothing left to reclaim", () => {
    const consent = issuer();
    const wideScope = { ...scope, detected: ["claude", "codex"] as const };

    expect(consent.grants(wideScope, "a".repeat(64))).toBeNull();
  });
});

// The receipt proves the removal itself was priced, where the reclaim token
// proves a named set of leftover paths was. Same secret, same instance, but
// never interchangeable: they authorize different destruction (#458).
describe("RemoveConsentIssuer receipts", () => {
  const scope = { target: GLOBAL, name: "tdd" };

  it("accepts back the receipt it minted for the same skill and target", () => {
    const consent = issuer();

    expect(consent.accepts(scope, consent.receipt(scope))).toBe(true);
  });

  it("refuses a request that carries no receipt at all", () => {
    expect(issuer().accepts(scope, undefined)).toBe(false);
  });

  it("refuses a receipt a caller merely guessed", () => {
    expect(issuer().accepts(scope, "a".repeat(64))).toBe(false);
  });

  it("refuses a receipt that is not even token-shaped", () => {
    expect(issuer().accepts(scope, "not-hex")).toBe(false);
  });

  it("refuses a receipt minted for a different skill", () => {
    const consent = issuer();

    expect(
      consent.accepts(scope, consent.receipt({ ...scope, name: "jobs" })),
    ).toBe(false);
  });

  it("refuses a receipt minted for a different target", () => {
    const consent = issuer();

    expect(
      consent.accepts(scope, consent.receipt({ ...scope, target: REPO })),
    ).toBe(false);
  });

  it("refuses a receipt minted by another instance", () => {
    expect(issuer().accepts(scope, issuer().receipt(scope))).toBe(false);
  });

  // Each token names the destruction it authorizes; one standing in for the
  // other would let a reclaim confirmation license the removal itself.
  it("never accepts a reclaim token in place of a receipt", () => {
    const consent = issuer();
    const offer = consent.offer({ ...scope, detected: ["codex"] });

    expect(consent.accepts(scope, offer?.token)).toBe(false);
  });

  it("never accepts a receipt in place of a reclaim token", () => {
    const consent = issuer();
    const reclaimScope = { ...scope, detected: ["codex"] as const };

    expect(consent.grants(reclaimScope, consent.receipt(scope))).toBeNull();
  });
});
