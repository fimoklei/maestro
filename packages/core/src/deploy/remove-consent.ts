// Consents only preflight can mint: reclaim (#339, #390), receipt (#458).
import { join } from "node:path";
import type { DeployTarget } from "./deploy-skill";
import {
  deployTargetSubtrees,
  reclaimableUntargetedTools,
  type SupportedTool,
} from "./deploy-tools";
import type { RemoveCheck } from "./remove-deployed-skill";
import { ConsentSigner } from "./signed-consent";

export type ReclaimPreview = {
  tool: SupportedTool;
  path: string;
};

function canonicalCheck(check: RemoveCheck): string[] {
  return check.scope === "repo"
    ? [`repo:${check.warning ?? "none"}`]
    : check.tools.map((row) => `${row.tool}:${row.warning ?? "none"}`).sort();
}

// One type, so a named path never reaches the screen without the token that
// authorizes deleting it, nor a token authorizes paths nobody was shown.
export type ReclaimConsent = {
  previews: readonly ReclaimPreview[];
  token: string;
};

export type RemoveScope = {
  target: DeployTarget;
  name: string;
};

// `detected` is undefined on the per-repo path, where nothing is reclaimed.
export type ReclaimScope = RemoveScope & {
  detected: readonly SupportedTool[] | undefined;
};

export class RemoveConsentIssuer {
  private readonly signer = new ConsentSigner();
  private readonly treeRoot: (target: DeployTarget) => string;

  constructor(deps: { treeRoot: (target: DeployTarget) => string }) {
    this.treeRoot = deps.treeRoot;
  }

  // Null when there is nothing to reclaim: an empty set mints no token.
  offer(scope: ReclaimScope): ReclaimConsent | null {
    const previews = this.previews(scope);
    return previews.length === 0
      ? null
      : { previews, token: this.token(scope, previews) };
  }

  // Returns the paths, so the caller deletes the set the confirmation named
  // (#390). Rebuild the preview here; never trust a caller-supplied set.
  grants(
    scope: ReclaimScope,
    token: string | undefined,
  ): readonly ReclaimPreview[] | null {
    if (token === undefined) {
      return null;
    }
    const offer = this.offer(scope);
    return offer !== null && this.matches(offer.token, token)
      ? offer.previews
      : null;
  }

  // Proves this server priced the removal itself (#458).
  receipt(scope: RemoveScope, check: RemoveCheck): string {
    return this.sign({
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
      receipt !== undefined && this.matches(this.receipt(scope, check), receipt)
    );
  }

  private previews(scope: ReclaimScope): ReclaimPreview[] {
    if (scope.detected === undefined) {
      return [];
    }
    const leftovers = reclaimableUntargetedTools(scope.detected);
    if (leftovers.length === 0) {
      return [];
    }
    let root: string;
    try {
      root = this.treeRoot(scope.target);
    } catch {
      return [];
    }
    const previews: ReclaimPreview[] = [];
    for (const tool of leftovers) {
      const [subtree] = deployTargetSubtrees(scope.name, [tool]);
      if (subtree !== undefined) {
        previews.push({ tool, path: join(root, subtree) });
      }
    }
    return previews;
  }

  private token(
    scope: ReclaimScope,
    previews: readonly ReclaimPreview[],
  ): string {
    return this.sign({
      kind: "reclaim",
      ...this.canonicalScope(scope),
      paths: previews.map((entry) => `${entry.tool}:${entry.path}`).sort(),
    });
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

  // `kind` keeps the two tokens apart: they authorize different destruction.
  private sign(payload: Record<string, unknown>): string {
    return this.signer.sign(payload);
  }

  private matches(expected: string, actual: string): boolean {
    return this.signer.matches(expected, actual);
  }
}
