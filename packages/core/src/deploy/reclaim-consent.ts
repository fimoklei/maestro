// The consent a global removal needs before it force-deletes a copy apm's own
// uninstall cannot reach.
//
// apm scopes its deletion by the targets it recorded, so a skill installed back
// when the machine had more tools leaves a whole tree behind for every tool that
// has since dropped off. Reclaiming those is what makes a global removal
// complete rather than complete-for-today's-tools (#339) — but it destroys more
// than the row the user clicked, so the confirmation has to name it first.
//
// Two things travel together here, and deliberately cannot be separated: the
// exact paths the confirmation must state, and a token proving those paths came
// from this server's own preflight. A caller that sends back a path list it
// merely guessed has proved nothing; a caller that sends back this token has
// proved a preflight ran against this same skill, target and machine state.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import type { DeployTarget } from "./deploy-skill";
import {
  deployTargetSubtrees,
  reclaimableUntargetedTools,
  type SupportedTool,
} from "./deploy-tools";

// One leftover copy a global removal would reclaim. Named by tool so the dialog
// can say which tool it is, and by absolute path so it can say exactly what
// goes.
export type ReclaimPreview = {
  tool: SupportedTool;
  path: string;
};

// What the confirmation shows and what `execute` must see back. One type, so a
// named path can never reach the screen without the token that authorizes
// deleting it, and a token can never authorize paths nobody was shown.
export type ReclaimConsent = {
  previews: readonly ReclaimPreview[];
  token: string;
};

// Which removal this consent is about. `detected` is the live tool probe;
// undefined on the per-repo path, whose targets are the repo's own apm.yml
// rather than this machine, so nothing there is ever reclaimed.
export type ReclaimScope = {
  target: DeployTarget;
  name: string;
  detected: readonly SupportedTool[] | undefined;
};

export class ReclaimConsentIssuer {
  // Generated once per instance and never exposed over the wire, so a valid
  // token can only exist because this instance's own `offer` produced it.
  private readonly secret = randomBytes(32);
  private readonly treeRoot: (target: DeployTarget) => string;

  constructor(deps: { treeRoot: (target: DeployTarget) => string }) {
    this.treeRoot = deps.treeRoot;
  }

  // The leftovers this removal would reclaim, with the token that authorizes
  // deleting exactly them. Null when there is nothing to reclaim — there is no
  // such thing as a consent for an empty set, so no token exists to replay.
  offer(scope: ReclaimScope): ReclaimConsent | null {
    const previews = this.previews(scope);
    return previews.length === 0
      ? null
      : { previews, token: this.token(scope, previews) };
  }

  // What this request's token authorizes deleting, or null when it authorizes
  // nothing. Returns the paths themselves rather than a yes/no, so the caller
  // deletes exactly the set the confirmation named instead of deriving its own
  // — two derivations of "which copies are reclaimable" is how a removal ends
  // up deleting more than the dialog stated, which is the defect #390 fixes.
  // The preview is rebuilt here rather than trusted from the request, so a
  // token minted for a different skill, target or machine state cannot carry
  // over.
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
      // Unnameable, so unreclaimable: without a root there is no path to state
      // in the confirmation, and this is the only builder `grants` consults.
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

  // Constant-time, so a guessed token cannot be narrowed down by measuring how
  // long the answer took. Anything malformed (wrong length, non-hex) simply
  // fails the match rather than throwing.
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
