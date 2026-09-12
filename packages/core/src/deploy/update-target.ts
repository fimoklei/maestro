// The Update use-case. `preview` prices moving a whole target to the latest
// release — what changes, what the release removes, and which copies stand in
// the way — and mints the token that proves this server priced it. `run` takes
// that token, re-prices under the target lock and writes through the one
// Selection lifecycle. See ADR-0031, ADR-0020, #953, #954.
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

// What a target follows today: the one release, and the skills deployed under
// it. Read from the deployment record's own files, never from `skills:`
// (ADR-0031). A target on no single release has nothing to update.
export type TargetSelectionResult =
  | { ok: true; release: string; selection: readonly string[] }
  | { ok: false; reason: "not-deployed" | "lockfile-malformed" };

export type TargetSelectionPort = {
  read(target: DeployTarget): Promise<TargetSelectionResult>;
};

// A skill the reader can go and read before adopting it: the name, and its
// folder at the chosen release. `url` is null where the connected Harness names
// no usable origin — a link nobody can follow is worse than none (ADR-0014).
export type UpdateSkillRow = { name: string; url: string | null };

// One copy the update would overwrite, at the grain consent is given at: per
// skill, and per tool where the target splits by tool (#952).
export type CopyConsentRow = { name: string; tool: SupportedTool | null };

export type UpdatePreview = {
  // The release the target follows now, and the only one on offer — the latest
  // (ADR-0031 § Accepted limits).
  release: string;
  chosenRelease: string;
  // The three numbers the counting sentence states, over the current Selection.
  counts: { changed: number; removed: number; unchanged: number };
  // The skill the Inventory's entrance asked for, when the target's own release
  // does not hold it. Empty from the card, which adds no skill of its own, and
  // empty when the request names a skill the Selection already carries (#955).
  addedByThisDeploy: readonly UpdateSkillRow[];
  changed: readonly UpdateSkillRow[];
  removed: readonly string[];
  unchanged: readonly string[];
  newInRelease: readonly UpdateSkillRow[];
  // What the reader must agree to before the update may run. Two lists, because
  // they are two different consents: dropping work, and overwriting a copy
  // nothing could verify (#952, spec story 37).
  localEdits: {
    discard: readonly CopyConsentRow[];
    unverified: readonly CopyConsentRow[];
  };
  // The exact Selection before and after. `desired` drops every name this
  // release removed and adds none; empty means the target becomes Empty.
  selection: { current: readonly string[]; desired: readonly string[] };
  // The guard's receipt licensing the overwrite of exactly the copies above.
  // Null where every copy is clean, so a caller cannot offer consent nobody
  // needs to give (#952).
  copyReceipt: string | null;
  // Proof this server priced this update. Stateless (ADR-0020).
  token: string;
};

// Each member's meaning for the reader is the server's
// `updatePreviewErrorResponses` table. Every one but the catch-all is a
// refusal something observed.
export type UpdatePreviewError =
  | "repo-not-registered"
  | "no-supported-tool"
  // The target follows no single release: Empty, or still pinned per skill.
  | "not-deployed"
  | "lockfile-malformed"
  | "deployed-unreadable"
  | "inventory-not-configured"
  // The Harness is connected; its tags or a release tree could not be read. A
  // preview never guesses a count (J04).
  | "inventory-unreadable"
  | "no-published-tag"
  // The requested skill is not in the release this update would adopt, so
  // nothing is priced: the reader is never moved to a release without it.
  | "skill-not-in-release"
  | "preview-failed";

export type UpdatePreviewResult =
  | { ok: true; preview: UpdatePreview }
  | { ok: false; error: UpdatePreviewError };

// Everything the token binds. Changing any of it retires the consent, so a
// preview of one state never authorises the update of another (#953).
export type UpdateScope = {
  target: DeployTarget;
  chosenRelease: string;
  current: readonly string[];
  desired: readonly string[];
  tools: readonly SupportedTool[];
  copies: LocalCopyCheck;
};

// What one copy reads as once apm has run, from its content and the deployment
// record — never from apm's own prose (ADR-0031, ADR-0018). "unknown" is the
// honest answer where nothing could be read back.
export type UpdateSkillState =
  | "updated"
  | "removed"
  | "not-updated"
  | "not-removed"
  | "unknown";

// One row per skill, and per tool where the target splits by tool, so a failing
// row on the global target names where to look (spec story 33).
export type UpdateOutcomeRow = {
  name: string;
  tool: SupportedTool | null;
  state: UpdateSkillState;
};

export type UpdateRunError =
  | UpdatePreviewError
  | "inventory-origin-unavailable"
  // The state the token priced is not the state under the lock: a newer
  // release, another Selection, or a copy that changed since (spec 24, 41).
  | "status-out-of-date"
  | "update-in-progress"
  | "operation-unfinished"
  | "deployed-diverged-from-lock"
  | "deployed-unverifiable"
  | "manifest-not-recognised"
  | "destination-symlinked"
  // apm ran and what landed is not the desired Selection. The operation record
  // survives, so Retry update converges on it.
  | "update-incomplete"
  | "update-failed";

export type UpdateRunResult =
  | { ok: true; release: string; outcome: readonly UpdateOutcomeRow[] }
  | {
      ok: false;
      error: UpdateRunError;
      // Present only where apm ran: a refusal before it has nothing to read
      // back, and an absent key can never be mistaken for a proven outcome.
      outcome?: readonly UpdateOutcomeRow[];
      // Present only where consent can clear the refusal (#952).
      copyReceipt?: string;
    };

const COPY_ERRORS: Record<Exclude<CopyVerdict, "clean">, UpdateRunError> = {
  "local-edits": "deployed-diverged-from-lock",
  unverified: "deployed-unverifiable",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

// A copy the update kept: only content equal to the chosen release proves it
// landed. Anything readable that is not equal did not; anything unreadable
// proves nothing (J04).
const KEPT: Record<DeployedContentState, UpdateSkillState> = {
  clean: "updated",
  "not-deployed": "not-updated",
  diverged: "not-updated",
  unverifiable: "unknown",
  unreadable: "unknown",
  "lockfile-malformed": "unknown",
};

// A copy the update dropped: only an absent one proves the removal.
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
    targetSelection: TargetSelectionPort;
    // The connected Harness's own tags and trees: content decides what changed,
    // never commit ancestry (ADR-0027).
    git: ReleaseHeadGitPort;
    resolveRoot: () => Promise<string | undefined>;
    // Where a row's link points. Null is "not known", never a guessed host.
    harnessOrigin: () => Promise<GitOrigin | null>;
    toolPresence: ToolPresencePort;
    // The one guard every write path classifies through (#952).
    copyGuard: Pick<LocalCopyGuard, "check" | "admits">;
    // The one owner of a Selection change: the manifest, the single apm call
    // and the proof it landed all belong to it (ADR-0031, #951).
    selection: Pick<SelectionWriter, "apply" | "pending">;
    // The outcome probe only; classification is the guard's.
    deployedContent: Pick<DeployedContentPort, "classify">;
    // realpath, so the lock cannot be sidestepped by a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
    // Shared with deploy and remove: all three rewrite one apm.lock.yaml.
    locks: InFlightLocks;
  };

  // Never exposed, never persisted: a restart retires every outstanding
  // preview, which is the safe direction (ADR-0020).
  private readonly signer = new ConsentSigner();

  constructor(deps: UpdateTarget["deps"]) {
    this.deps = deps;
  }

  // A read: it takes no lock, so previewing cannot block an operation already
  // in flight.
  async preview(input: {
    target: DeployTarget;
    // The Inventory's entrance: one skill to add beside the release move (#955).
    add?: string;
  }): Promise<UpdatePreviewResult> {
    // Before any filesystem or apm access (security.md).
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
      // A pricing that threw priced nothing; it is never answered as an update
      // with no cost (J04).
      return { ok: false, error: "preview-failed" };
    }
  }

  // The confirm. Everything it acts on it reads itself, under the target lock:
  // the token proves the reader saw this state, never that this state holds.
  async run(input: {
    target: DeployTarget;
    token: string;
    add?: string;
    confirmedCopyReceipt?: string;
  }): Promise<UpdateRunResult> {
    // Before any filesystem or apm access (security.md).
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
    // Swallow rather than rethrow: a raw apm message may carry a token and must
    // never reach the transport layer (security.md).
    try {
      const priced = await this.price(input.target, input.add);
      if (!priced.ok) {
        return { ok: false, error: priced.error };
      }
      const { scope } = priced;
      if (!this.accepts(scope, input.token)) {
        return { ok: false, error: "status-out-of-date" };
      }
      // An unfinished operation is converged before anything else runs, so a
      // retry never has to reconcile two intents (#951).
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
      const outcome = await this.outcome(scope);
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

  // What landed, read back per copy: content equal to the chosen release, or an
  // absence where the release dropped the name. apm's own marker decides
  // nothing here (ADR-0031 § completion).
  private async outcome(scope: UpdateScope): Promise<UpdateOutcomeRow[]> {
    const tools: (SupportedTool | null)[] =
      scope.tools.length === 0 ? [null] : [...scope.tools];
    const kept = new Set(scope.desired);
    // A copy equal to its recorded baseline proves only that the copy and the
    // record agree. Which release that record names is the other half, and
    // without it no skill is claimed to have moved (ADR-0031 § completion).
    const landed = await this.deps.targetSelection
      .read(scope.target)
      .catch(() => null);
    const onRelease =
      landed === null || !landed.ok
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

  // `scope` is what the update found now, never what the caller claims: a token
  // minted for another release, Selection, tool set or content is no consent
  // for this one (#364, #953).
  accepts(scope: UpdateScope, token: string | undefined): boolean {
    return this.signer.matches(this.token(scope), token);
  }

  // One pass for both entry points: the priced preview the reader sees and the
  // scope the token is minted over can never disagree.
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

    const state = await this.deps.targetSelection.read(target);
    if (!state.ok) {
      return { ok: false, error: state.reason };
    }

    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "inventory-not-configured" };
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

    // Read before anything is priced: a release that does not hold the skill
    // the reader asked for is never adopted on their behalf (#955).
    if (add !== undefined && !next.has(add)) {
      return { ok: false, error: "skill-not-in-release" };
    }
    const added =
      add !== undefined && !state.selection.includes(add) ? [add] : [];

    // Every selected copy is at risk: the install rewrites the whole Selection,
    // and a name this release dropped is deleted. The skill being added joins
    // them — a copy of it already on disk is overwritten too. The chosen release
    // goes in, so a copy already equal to it is not read as an edit (#952).
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
      // No consent exists for a copy nobody could read; the update stops here
      // rather than overwrite work on a guess (spec story 43).
      return {
        ok: false,
        error:
          decision.blocked === "lockfile-malformed"
            ? "lockfile-malformed"
            : "deployed-unreadable",
      };
    }

    const origin = await this.deps.harnessOrigin().catch(() => null);
    const link = (name: string) =>
      origin === null
        ? null
        : `https://${origin.host}/${origin.ownerRepo}/tree/${latest.name}/.apm/skills/${name}`;
    const row = (name: string): UpdateSkillRow => ({ name, url: link(name) });

    const changed = state.selection.filter(
      (name) => next.has(name) && current.get(name) !== next.get(name),
    );
    const removed = state.selection.filter((name) => !next.has(name));
    const unchanged = state.selection.filter(
      (name) => next.has(name) && current.get(name) === next.get(name),
    );
    // Update adds nothing automatically: these are shown to read, not to pick
    // (spec story 18). The requested skill is named in its own section, so it
    // never appears twice.
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

  // Order-independent on every list: the same update in another order is the
  // same update, and the tool probe orders its own answer.
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

// "updated" is a claim about a release, so it needs the deployment record to
// name that release. A record naming another one downgrades the row; a record
// that could not be read leaves it unknown rather than either claim (J04).
function whereRecorded(
  state: UpdateSkillState,
  onRelease: boolean | null,
): UpdateSkillState {
  if (state !== "updated" || onRelease === true) {
    return state;
  }
  return onRelease === null ? "unknown" : "not-updated";
}

function consentRows(
  copies: LocalCopyCheck,
  verdict: "local-edits" | "unverified",
): CopyConsentRow[] {
  return copies.findings
    .filter((finding) => finding.verdict === verdict)
    .map((finding) => ({ name: finding.name, tool: finding.tool }));
}
