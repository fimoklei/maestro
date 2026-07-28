// The consent a global removal needs before force-deleting a copy apm's own
// uninstall cannot reach: the paths the confirmation states, plus a token
// proving they came from this server's own preflight. See #339, #390.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import type { DeployTarget } from "./deploy-skill";
import {
  deployTargetSubtrees,
  reclaimableUntargetedTools,
  type SupportedTool,
} from "./deploy-tools";

export type ReclaimPreview = {
  tool: SupportedTool;
  path: string;
};

// One type, so a named path can never reach the screen without the token that
// authorizes deleting it, nor a token authorize paths nobody was shown.
export type ReclaimConsent = {
  previews: readonly ReclaimPreview[];
  token: string;
};

// `detected` is the live tool probe; undefined on the per-repo path, where
// nothing is ever reclaimed.
export type ReclaimScope = {
  target: DeployTarget;
  name: string;
  detected: readonly SupportedTool[] | undefined;
};

export class ReclaimConsentIssuer {
  // Never exposed over the wire, so a valid token can only exist because this
  // instance's own `offer` produced it.
  private readonly secret = randomBytes(32);
  private readonly treeRoot: (target: DeployTarget) => string;

  constructor(deps: { treeRoot: (target: DeployTarget) => string }) {
    this.treeRoot = deps.treeRoot;
  }

  // Null when there is nothing to reclaim: no consent exists for an empty set,
  // so no token exists to replay.
  offer(scope: ReclaimScope): ReclaimConsent | null {
    const previews = this.previews(scope);
    return previews.length === 0
      ? null
      : { previews, token: this.token(scope, previews) };
  }

  // Returns the paths, not a yes/no, so the caller deletes the set the
  // confirmation named rather than deriving its own (#390). The preview is
  // rebuilt here, so a token minted for a different scope cannot carry over.
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
    const canonical = JSON.stringify({
      target:
        scope.target.kind === "repo"
          ? { kind: "repo", repoPath: scope.target.repoPath }
          : { kind: "global" },
      name: scope.name,
      paths: previews.map((entry) => `${entry.tool}:${entry.path}`).sort(),
    });
    return createHmac("sha256", this.secret).update(canonical).digest("hex");
  }

  // Constant-time; anything malformed fails the match rather than throwing.
  private matches(expected: string, actual: string): boolean {
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(actual, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
