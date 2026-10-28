// The consent only preflight can mint: the receipt (#458).
import type { DeployTarget } from "./deploy-skill";
import type { RemoveCheck } from "./remove-deployed-skill";
import { ConsentSigner } from "./signed-consent";

function canonicalCheck(check: RemoveCheck): string[] {
  return check.scope === "repo"
    ? [`repo:${check.warning ?? "none"}`]
    : check.tools.map((row) => `${row.tool}:${row.warning ?? "none"}`).sort();
}

export type RemoveScope = {
  target: DeployTarget;
  name: string;
};

export class RemoveConsentIssuer {
  private readonly signer = new ConsentSigner();

  // Proves this server priced the removal itself (#458).
  receipt(scope: RemoveScope, check: RemoveCheck): string {
    return this.signer.sign({
      kind: "receipt",
      ...this.canonicalScope(scope),
      check: canonicalCheck(check),
    });
  }

  // `check` is what the removal found just now, never what the caller claims
  // (#364).
  accepts(
    scope: RemoveScope,
    check: RemoveCheck,
    receipt: string | undefined,
  ): boolean {
    return (
      receipt !== undefined &&
      this.signer.matches(this.receipt(scope, check), receipt)
    );
  }

  private canonicalScope(scope: RemoveScope) {
    return {
      target:
        scope.target.kind === "repo"
          ? { kind: "repo", repoPath: scope.target.repoPath }
          : { kind: "global" },
      name: scope.name,
    };
  }
}
