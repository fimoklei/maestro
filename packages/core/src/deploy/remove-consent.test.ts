import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { RemoveConsentIssuer } from "./remove-consent";
import type { RemoveCheck } from "./remove-deployed-skill";

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

  it("refuses a token-shaped prefix of the token it issued", () => {
    // Hex that parses cleanly but is shorter than a token: the comparison must
    // refuse it on length, never on the bytes the two happen to share.
    const consent = issuer();
    const offer = consent.offer(scope);

    expect(consent.grants(scope, offer?.token.slice(0, 8) ?? "")).toBeNull();
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

  // The cost the confirmation stated. A receipt is minted against one of these,
  // so a copy that changed since cannot pass as the one the user agreed to (#364).
  const CLEAN = {
    scope: "global",
    tools: [
      { tool: "claude", warning: null },
      { tool: "codex", warning: null },
    ],
  } as const satisfies RemoveCheck;
  const EDITED = {
    scope: "global",
    tools: [
      { tool: "claude", warning: "local-edits-will-be-lost" },
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

  // The window #364 closes: the copy was clean when the user was warned and
  // carries edits by the time the removal runs, so the consent no longer
  // describes what would be destroyed.
  it("refuses a receipt minted for a cost the copy no longer carries", () => {
    const consent = issuer();

    expect(consent.accepts(scope, EDITED, consent.receipt(scope, CLEAN))).toBe(
      false,
    );
  });

  // The tool probe orders its own answer, and the same set of answers in
  // another order is the same cost — refusing it would cost a click for nothing.
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

  // Each token names the destruction it authorizes; one standing in for the
  // other would let a reclaim confirmation license the removal itself.
  it("never accepts a reclaim token in place of a receipt", () => {
    const consent = issuer();
    const offer = consent.offer({ ...scope, detected: ["codex"] });

    expect(consent.accepts(scope, CLEAN, offer?.token)).toBe(false);
  });

  it("never accepts a receipt in place of a reclaim token", () => {
    const consent = issuer();
    const reclaimScope = { ...scope, detected: ["codex"] as const };

    expect(
      consent.grants(reclaimScope, consent.receipt(scope, CLEAN)),
    ).toBeNull();
  });
});
