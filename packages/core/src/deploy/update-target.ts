import type { ReleaseHeadGitPort } from "../deploy-state/release-head";
import { highestReleaseTag } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/skill-movements";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { GitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyVerdict,
  copyKeys,
  type LocalCopyCheck,
  type LocalCopyGuard,
} from "./local-copy-guard";
import { ConsentSigner } from "./signed-consent";
import type { TargetSelection } from "./target-selection";

// `url` points at the skill's folder at the chosen release; null where a
// caller has no link to give (#960).
export type UpdateSkillRow = { name: string; url: string | null };

export type CopyConsentRow = { name: string; tool: SupportedTool | null };

export type UpdatePreview = {
  release: string;
  chosenRelease: string;
  counts: { changed: number; removed: number; unchanged: number };
  // The requested skill when the target's own release does not hold it; empty
  // when the Selection already carries it (#955).
  addedByThisDeploy: readonly UpdateSkillRow[];
  changed: readonly UpdateSkillRow[];
  removed: readonly string[];
  unchanged: readonly string[];
  newInRelease: readonly UpdateSkillRow[];
  // Two consents: dropping work, and overwriting a copy nothing could verify
  // (#952).
  localEdits: {
    discard: readonly CopyConsentRow[];
    unverified: readonly CopyConsentRow[];
  };
  selection: { current: readonly string[]; desired: readonly string[] };
  // Null where every copy is clean, so no caller offers consent nobody needs
  // to give (#952).
  copyReceipt: string | null;
  token: string;
};

export type UpdatePreviewError =
  | "repo-not-registered"
  | "no-supported-tool"
  // The target follows no single release: Empty, or still pinned per skill.
  | "not-deployed"
  | "lockfile-malformed"
  | "deployed-unreadable"
  | "inventory-not-configured"
  | "inventory-unreadable"
  | "no-published-tag"
  // Without a GitHub origin the target's root package cannot be proven ours,
  // so nothing is priced (#960).
  | "inventory-origin-unavailable"
  | "ref-unresolvable"
  | "skill-not-in-release"
  | "preview-failed";

export type UpdatePreviewResult =
  | { ok: true; preview: UpdatePreview }
  | { ok: false; error: UpdatePreviewError };

// Everything the token binds: changing any of it retires the consent (#953).
export type UpdateScope = {
  target: DeployTarget;
  chosenRelease: string;
  current: readonly string[];
  desired: readonly string[];
  tools: readonly SupportedTool[];
  copies: LocalCopyCheck;
};

// Read from content and the deployment record, never from apm's prose.
export type UpdateSkillState =
  | "updated"
  | "removed"
  | "not-updated"
  | "not-removed"
  | "unknown";

export type UpdateOutcomeRow = {
  name: string;
  tool: SupportedTool | null;
  state: UpdateSkillState;
};

export type UpdateRunError =
  | UpdatePreviewError
  | "status-out-of-date"
  | "update-in-progress"
  | "operation-unfinished"
  | "deployed-diverged-from-lock"
  | "deployed-unverifiable"
  | "manifest-not-recognised"
  | "destination-symlinked"
  | "update-incomplete"
  | "update-failed";

export type UpdateRunResult =
  | { ok: true; release: string; outcome: readonly UpdateOutcomeRow[] }
  | {
      ok: false;
      error: UpdateRunError;
      // Only where apm ran, so an absent key is never a proven outcome.
      outcome?: readonly UpdateOutcomeRow[];
      // Only where consent can clear the refusal (#952).
      copyReceipt?: string;
    };

const COPY_ERRORS: Record<Exclude<CopyVerdict, "clean">, UpdateRunError> = {
  "local-edits": "deployed-diverged-from-lock",
  unverified: "deployed-unverifiable",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// A kept copy landed only when its content equals the chosen release;
// anything unreadable proves nothing.
const KEPT: Record<DeployedContentState, UpdateSkillState> = {
  clean: "updated",
  "not-deployed": "not-updated",
  diverged: "not-updated",
  unverifiable: "unknown",
  unreadable: "unknown",
  "lockfile-malformed": "unknown",
};

// A dropped copy: only an absent one proves the removal.
const DROPPED: Record<DeployedContentState, UpdateSkillState> = {
  "not-deployed": "removed",
  clean: "not-removed",
  diverged: "not-removed",
  unverifiable: "not-removed",
  unreadable: "unknown",
  "lockfile-malformed": "unknown",
};

export class UpdateTarget {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    // Content decides what changed, never commit ancestry.
    git: ReleaseHeadGitPort;
    resolveRoot: () => Promise<string | undefined>;
    // Null is "not known", never a guessed host.
    harnessOrigin: () => Promise<GitOrigin | null>;
    toolPresence: ToolPresencePort;
    copyGuard: Pick<LocalCopyGuard, "check" | "admits">;
    selection: Pick<SelectionWriter, "apply" | "pending" | "readTarget">;
    // The outcome probe only; classification is the guard's.
    deployedContent: Pick<DeployedContentPort, "classify">;
    // realpath, so the lock cannot be sidestepped by a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
    // Shared with deploy and remove: all three rewrite one apm.lock.yaml.
    locks: InFlightLocks;
  };

  // Never exposed, never persisted: a restart retires every outstanding
  // preview, which is the safe direction.
  private readonly signer = new ConsentSigner();

  constructor(deps: UpdateTarget["deps"]) {
    this.deps = deps;
  }

  // A read: takes no lock, so it cannot block an operation in flight.
  async preview(input: {
    target: DeployTarget;
    add?: string;
  }): Promise<UpdatePreviewResult> {
    // Before any filesystem or apm access.
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return { ok: false, error: "repo-not-registered" };
    }
    try {
      const priced = await this.price(input.target, input.add);
      return priced.ok
        ? { ok: true, preview: priced.preview }
        : { ok: false, error: priced.error };
    } catch {
      return { ok: false, error: "preview-failed" };
    }
  }

  // Re-reads everything under the target lock: the token proves the reader
  // saw this state, never that this state still holds.
  async run(input: {
    target: DeployTarget;
    token: string;
    add?: string;
    confirmedCopyReceipt?: string;
  }): Promise<UpdateRunResult> {
    // Before any filesystem or apm access.
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return { ok: false, error: "repo-not-registered" };
    }
    let key: string;
    try {
      key =
        input.target.kind === "repo"
          ? await this.deps.canonicalPath(input.target.repoPath)
          : GLOBAL_LOCK_KEY;
    } catch {
      return { ok: false, error: "update-failed" };
    }
    const run = await this.deps.locks.run(key, () => this.write(input, key));
    return run.ok ? run.value : { ok: false, error: "update-in-progress" };
  }

  private async write(
    input: {
      target: DeployTarget;
      token: string;
      add?: string;
      confirmedCopyReceipt?: string;
    },
    key: string,
  ): Promise<UpdateRunResult> {
    // Never rethrow: a raw apm message may carry a token.
    try {
      const priced = await this.price(input.target, input.add);
      if (!priced.ok) {
        return { ok: false, error: priced.error };
      }
      const { scope } = priced;
      if (!this.accepts(scope, input.token)) {
        return { ok: false, error: "status-out-of-date" };
      }
      // An unfinished operation converges first, so a retry never has to
      // reconcile two intents (#951).
      if ((await this.deps.selection.pending(key)) !== null) {
        return { ok: false, error: "operation-unfinished" };
      }
      const origin = await this.deps.harnessOrigin().catch(() => null);
      if (origin === null) {
        return { ok: false, error: "inventory-origin-unavailable" };
      }
      const guarded = { write: "update", target: input.target } as const;
      const admitted = this.deps.copyGuard.admits(
        guarded,
        scope.copies,
        input.confirmedCopyReceipt,
      );
      if (!admitted.ok) {
        return {
          ok: false,
          error: COPY_ERRORS[admitted.blocked],
          ...(admitted.receipt === null
            ? {}
            : { copyReceipt: admitted.receipt }),
        };
      }

      const applied = await this.deps.selection.apply({
        target: input.target,
        key,
        kind: "update",
        origin,
        release: scope.chosenRelease,
        previous: scope.current,
        desired: scope.desired,
        ...(scope.tools.length === 0 ? {} : { tools: scope.tools }),
      });
      const outcome = await this.outcome(scope, origin);
      if (applied.ok) {
        return { ok: true, release: scope.chosenRelease, outcome };
      }
      return {
        ok: false,
        error:
          applied.error === "manifest-not-recognised" ||
          applied.error === "destination-symlinked"
            ? applied.error
            : applied.error === "apply-incomplete"
              ? "update-incomplete"
              : "update-failed",
        outcome,
      };
    } catch {
      return { ok: false, error: "update-failed" };
    }
  }

  // Read back per copy; apm's own marker decides nothing here.
  private async outcome(
    scope: UpdateScope,
    origin: GitOrigin,
  ): Promise<UpdateOutcomeRow[]> {
    const tools: (SupportedTool | null)[] =
      scope.tools.length === 0 ? [null] : [...scope.tools];
    const kept = new Set(scope.desired);
    // A clean copy proves only that copy and record agree; the record must also
    // name the chosen release before a skill is claimed to have moved.
    const landed = await this.deps.selection
      .readTarget(scope.target, origin)
      .catch(() => null);
    const onRelease =
      landed === null || landed.kind !== "root"
        ? null
        : landed.release === scope.chosenRelease;
    const rows: UpdateOutcomeRow[] = [];
    for (const name of [...new Set([...scope.current, ...scope.desired])]) {
      for (const tool of tools) {
        const state = await this.deps.deployedContent
          .classify({
            target: scope.target,
            name,
            ...(tool === null ? {} : { tools: [tool] }),
            release: scope.chosenRelease,
          })
          .catch(() => "unreadable" as const);
        rows.push({
          name,
          tool,
          state: kept.has(name)
            ? whereRecorded(KEPT[state], onRelease)
            : DROPPED[state],
        });
      }
    }
    return rows;
  }

  // `scope` is what the update found now, never what the caller claims
  // (#364, #953).
  accepts(scope: UpdateScope, token: string | undefined): boolean {
    return this.signer.matches(this.token(scope), token);
  }

  // Shared by preview and run, so the preview and the token's scope never
  // disagree.
  private async price(
    target: DeployTarget,
    add?: string,
  ): Promise<
    | { ok: true; preview: UpdatePreview; scope: UpdateScope }
    | { ok: false; error: UpdatePreviewError }
  > {
    const tools =
      target.kind === "global"
        ? await this.deps.toolPresence.detectGlobalTools()
        : [];
    if (target.kind === "global" && tools.length === 0) {
      return { ok: false, error: "no-supported-tool" };
    }

    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "inventory-not-configured" };
    }
    const origin = await this.deps.harnessOrigin().catch(() => null);
    if (origin === null) {
      return { ok: false, error: "inventory-origin-unavailable" };
    }
    const state = readSelection(
      await this.deps.selection.readTarget(target, origin),
    );
    if (!state.ok) {
      return { ok: false, error: state.error };
    }
    const tags = await this.deps.git.readTags(root);
    if (tags === null) {
      return { ok: false, error: "inventory-unreadable" };
    }
    const latest = highestReleaseTag(tags);
    if (latest === null) {
      return { ok: false, error: "no-published-tag" };
    }
    const [current, next] = await Promise.all([
      this.treesAt(root, state.release),
      this.treesAt(root, latest.name),
    ]);
    if (current === null || next === null) {
      return { ok: false, error: "inventory-unreadable" };
    }

    // A release without the requested skill is never adopted on the reader's
    // behalf (#955).
    if (add !== undefined && !next.has(add)) {
      return { ok: false, error: "skill-not-in-release" };
    }
    const added =
      add !== undefined && !state.selection.includes(add) ? [add] : [];

    // The install rewrites the whole Selection, so every selected copy is at
    // risk. A copy equal to the chosen release is not an edit (#952).
    const copies = await this.deps.copyGuard.check({
      write: "update",
      target,
      names: [...state.selection, ...added],
      ...(tools.length === 0 ? {} : { tools }),
      release: latest.name,
    });
    const decision = this.deps.copyGuard.admits(
      { write: "update", target },
      copies,
    );
    if (!decision.ok && decision.receipt === null) {
      // No consent exists for a copy nobody could read.
      return {
        ok: false,
        error:
          decision.blocked === "lockfile-malformed"
            ? "lockfile-malformed"
            : "deployed-unreadable",
      };
    }

    const row = (name: string): UpdateSkillRow => ({
      name,
      url: `https://${origin.host}/${origin.ownerRepo}/tree/${latest.name}/.apm/skills/${name}`,
    });

    const changed = state.selection.filter(
      (name) => next.has(name) && current.get(name) !== next.get(name),
    );
    const removed = state.selection.filter((name) => !next.has(name));
    const unchanged = state.selection.filter(
      (name) => next.has(name) && current.get(name) === next.get(name),
    );
    // Shown to read, not to pick: Update adds nothing automatically.
    const newInRelease = [...next.keys()].filter(
      (name) => !state.selection.includes(name) && !added.includes(name),
    );
    const desired = [
      ...state.selection.filter((name) => next.has(name)),
      ...added,
    ];
    const scope: UpdateScope = {
      target,
      chosenRelease: latest.name,
      current: state.selection,
      desired,
      tools,
      copies,
    };

    return {
      ok: true,
      scope,
      preview: {
        release: state.release,
        chosenRelease: latest.name,
        counts: {
          changed: changed.length,
          removed: removed.length,
          unchanged: unchanged.length,
        },
        addedByThisDeploy: added.map(row),
        changed: changed.map(row),
        removed,
        unchanged,
        newInRelease: newInRelease.map(row),
        localEdits: {
          discard: consentRows(copies, "local-edits"),
          unverified: consentRows(copies, "unverified"),
        },
        selection: { current: state.selection, desired },
        copyReceipt: decision.ok ? null : decision.receipt,
        token: this.token(scope),
      },
    };
  }

  // Order-independent on every list: the tool probe orders its own answer.
  private token(scope: UpdateScope): string {
    return this.signer.sign({
      kind: "update-preflight",
      target:
        scope.target.kind === "repo"
          ? { kind: "repo", repoPath: scope.target.repoPath }
          : { kind: "global" },
      chosenRelease: scope.chosenRelease,
      current: [...scope.current].sort(),
      desired: [...scope.desired].sort(),
      tools: [...scope.tools].sort(),
      copies: copyKeys(scope.copies),
      content: scope.copies.digest,
    });
  }

  private async treesAt(
    root: string,
    tag: string,
  ): Promise<Map<string, string> | null> {
    const skills: HarnessSkillTree[] | null = await this.deps.git
      .readSkillTreesAtTag(root, tag)
      .catch(() => null);
    return skills === null
      ? null
      : new Map(skills.map((skill) => [skill.name, skill.treeHash]));
  }
}

// "updated" needs the deployment record to name the chosen release; an
// unreadable record leaves the row unknown.
function whereRecorded(
  state: UpdateSkillState,
  onRelease: boolean | null,
): UpdateSkillState {
  if (state !== "updated" || onRelease === true) {
    return state;
  }
  return onRelease === null ? "unknown" : "not-updated";
}

function readSelection(
  selection: TargetSelection,
):
  | { ok: true; release: string; selection: readonly string[] }
  | { ok: false; error: UpdatePreviewError } {
  if (selection.kind === "root") {
    return {
      ok: true,
      release: selection.release,
      selection: selection.deployed,
    };
  }
  if (selection.kind === "unreadable") {
    return { ok: false, error: selection.reason };
  }
  return { ok: false, error: "not-deployed" };
}

function consentRows(
  copies: LocalCopyCheck,
  verdict: "local-edits" | "unverified",
): CopyConsentRow[] {
  return copies.findings
    .filter((finding) => finding.verdict === verdict)
    .map((finding) => ({ name: finding.name, tool: finding.tool }));
}
