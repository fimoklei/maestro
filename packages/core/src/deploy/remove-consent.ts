// Consents only preflight can mint: reclaim (#339, #390), receipt (#458).
// Stateless by design — see ADR-0020.
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

// Order-independent, like the reclaim's own paths: the tool probe orders its
// answer, and the same answers in another order are the same cost.
function canonicalCheck(check: RemoveCheck): string[] {
  return check.scope === "repo"
    ? [`repo:${check.warning ?? "none"}`]
    : check.tools.map((row) => `${row.tool}:${row.warning ?? "none"}`).sort();
}

// One type, so a named path can never reach the screen without the token that
// authorizes deleting it, nor a token authorize paths nobody was shown.
export type ReclaimConsent = {
  previews: readonly ReclaimPreview[];
  token: string;
};

// What one removal is about, before any question of leftovers.
export type RemoveScope = {
  target: DeployTarget;
  name: string;
};

// `detected` is the live tool probe; undefined on the per-repo path, where
// nothing is ever reclaimed.
export type ReclaimScope = RemoveScope & {
  detected: readonly SupportedTool[] | undefined;
};

export class RemoveConsentIssuer {
  // Never exposed over the wire, never persisted (ADR-0020).
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

  // Returns the paths, not a yes/no, so the caller deletes the set the
  // confirmation named rather than deriving its own (#390). Rebuild the preview
  // here; never compare against a caller-supplied set (ADR-0020).
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

  // The proof that this server priced the removal itself, minted by every
  // preflight that answers. Unlike a reclaim, it names no paths: what it
  // authorizes is deleting the copy the request already names, at the cost the
  // check found (#458, #364).
  receipt(scope: RemoveScope, check: RemoveCheck): string {
    return this.sign({
      kind: "receipt",
      ...this.canonicalScope(scope),
      check: canonicalCheck(check),
    });
  }

  // `check` is what the removal found just now, not what the caller claims: a
  // receipt minted for a different cost is no consent for this one (#364).
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
      // Unnameable, so unreclaimable — this is the only builder `grants`
      // consults.
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

  // Order-independent, so the same set of leftovers always yields the same
  // token however the tool list was ordered.
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

  // `kind` keeps the two apart: neither token may ever pass as the other, since
  // they authorize different destruction.
  private sign(payload: Record<string, unknown>): string {
    return this.signer.sign(payload);
  }

  private matches(expected: string, actual: string): boolean {
    return this.signer.matches(expected, actual);
  }
}
