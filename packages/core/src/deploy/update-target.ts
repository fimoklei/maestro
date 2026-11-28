import type { ReleaseHeadGitPort } from "../deploy-state/release-head";
import { highestReleaseTag } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/released-content";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { SelectionWriter } from "./apply-selection";
import type {
  DeployedCleanupPort,
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
  LinkedDestination,
} from "./deploy-skill";
import { SUPPORTED_TOOLS, type SupportedTool } from "./deploy-tools";
import { discardDroppedCopies } from "./discard-dropped-copies";
import type { GitOrigin } from "./git-origin";
import { GLOBAL_LOCK_KEY, type InFlightLocks } from "./in-flight-locks";
import {
  type CopyBlock,
  copyKeys,
  type LocalCopyCheck,
  type LocalCopyGuard,
  linkedField,
} from "./local-copy-guard";
import type { PlaceReader } from "./place-reading";
import { ConsentSigner } from "./signed-consent";
import type { TargetSelection } from "./target-selection";
import {
  type ReportSkill,
  reportWrite,
  type WriteReport,
} from "./write-report";

export type UpdateSkillRow = { name: string; url: string | null };

export type CopyConsentRow = { name: string; tool: SupportedTool | null };

export type UpdatePreview = {
  release: string;
  chosenRelease: string;
  counts: { changed: number; removed: number; unchanged: number };
  addedByThisDeploy: readonly UpdateSkillRow[];
  changed: readonly UpdateSkillRow[];
  removed: readonly string[];
  unchanged: readonly string[];
  newInRelease: readonly UpdateSkillRow[];
  localEdits: {
    discard: readonly CopyConsentRow[];
    unverified: readonly CopyConsentRow[];
  };
  selection: { current: readonly string[]; desired: readonly string[] };
  copyReceipt: string | null;
  token: string;
};

export type UpdatePreviewError =
  | "repo-not-registered"
  | "no-supported-tool"
  | "not-deployed"
  | "lockfile-malformed"
  | "deployed-unreadable"
  | "inventory-not-configured"
  | "inventory-unreadable"
  | "no-published-tag"
  | "inventory-origin-unavailable"
  | "ref-unresolvable"
  | "skill-not-in-release"
  | "destination-symlinked"
  | "preview-failed";

type PreviewRefusal = {
  ok: false;
  error: UpdatePreviewError;
  linked?: LinkedDestination;
};

export type UpdatePreviewResult =
  | { ok: true; preview: UpdatePreview }
  | PreviewRefusal;

export type UpdateScope = {
  target: DeployTarget;
  chosenRelease: string;
  current: readonly string[];
  desired: readonly string[];
  tools: readonly SupportedTool[];
  copies: LocalCopyCheck;
};

export type UpdateRunError =
  | UpdatePreviewError
  | "status-out-of-date"
  | "update-in-progress"
  | "operation-unfinished"
  | "deployed-diverged-from-lock"
  | "deployed-unverifiable"
  | "manifest-not-recognised"
  | "manifest-legacy-entry"
  | "update-incomplete"
  | "update-timed-out"
  | "update-failed";

export type UpdateRunResult =
  | { ok: true; release: string; report: WriteReport }
  | {
      ok: false;
      error: UpdateRunError;
      linked?: LinkedDestination;
      report?: WriteReport;
      copyReceipt?: string;
    };

const COPY_ERRORS: Record<CopyBlock, UpdateRunError> = {
  linked: "destination-symlinked",
  "local-edits": "deployed-diverged-from-lock",
  unverified: "deployed-unverifiable",
  unreadable: "deployed-unreadable",
  "lockfile-malformed": "lockfile-malformed",
};

type RepoState = Exclude<
  ReportSkill["state"],
  "already-at-release" | "refused"
>;

const KEPT: Record<DeployedContentState, RepoState> = {
  clean: "written",
  "not-deployed": "missing",
  diverged: "not-updated",
  unverifiable: "not-confirmed",
  unreadable: "not-confirmed",
  "lockfile-malformed": "not-confirmed",
};

const DROPPED: Record<DeployedContentState, RepoState> = {
  "not-deployed": "removed",
  clean: "not-removed",
  diverged: "not-removed",
  unverifiable: "not-removed",
  unreadable: "not-confirmed",
  "lockfile-malformed": "not-confirmed",
};

export class UpdateTarget {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    git: ReleaseHeadGitPort;
    resolveRoot: () => Promise<string | undefined>;
    harnessOrigin: () => Promise<GitOrigin | null>;
    toolPresence: ToolPresencePort;
    copyGuard: Pick<LocalCopyGuard, "check" | "admits">;
    selection: Pick<SelectionWriter, "apply" | "pending" | "readTarget">;
    deployedCleanup: DeployedCleanupPort;
    deployedContent: Pick<DeployedContentPort, "readLockfile" | "classify">;
    outcomes: Pick<PlaceReader, "read">;
    canonicalPath: (path: string) => Promise<string>;
    locks: InFlightLocks;
  };

  private readonly signer = new ConsentSigner();

  constructor(deps: UpdateTarget["deps"]) {
    this.deps = deps;
  }

  async preview(input: {
    target: DeployTarget;
    add?: string;
  }): Promise<UpdatePreviewResult> {
    if (
      input.target.kind === "repo" &&
      !(await this.deps.registry.isRegistered(input.target.repoPath))
    ) {
      return { ok: false, error: "repo-not-registered" };
    }
    try {
      const priced = await this.price(input.target, input.add);
      return priced.ok ? { ok: true, preview: priced.preview } : priced;
    } catch {
      return { ok: false, error: "preview-failed" };
    }
  }

  async run(input: {
    target: DeployTarget;
    token: string;
    add?: string;
    confirmedCopyReceipt?: string;
  }): Promise<UpdateRunResult> {
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
    try {
      const priced = await this.price(input.target, input.add);
      if (!priced.ok) {
        return priced;
      }
      const { scope } = priced;
      if (!this.accepts(scope, input.token)) {
        return { ok: false, error: "status-out-of-date" };
      }
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
          ...linkedField(admitted),
          ...(admitted.receipt === null
            ? {}
            : { copyReceipt: admitted.receipt }),
        };
      }

      await discardDroppedCopies(this.deps.deployedCleanup, {
        target: input.target,
        previous: scope.current,
        desired: scope.desired,
        tools: scope.tools,
      });
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
      if (!applied.ok && applied.error === "manifest-legacy-entry") {
        return { ok: false, error: applied.error };
      }
      const report =
        input.target.kind === "global"
          ? reportWrite({
              readings: await this.deps.outcomes.read({
                target: input.target,
                release: scope.chosenRelease,
                names: scope.desired,
                tools: scope.tools,
              }),
              names: scope.desired,
              wrote: new Set(scope.desired),
              refused: new Map(),
            })
          : await this.repoReport(scope, origin);
      if (applied.ok) {
        return { ok: true, release: scope.chosenRelease, report };
      }
      return {
        ok: false,
        error:
          applied.error === "manifest-not-recognised" ||
          applied.error === "destination-symlinked"
            ? applied.error
            : applied.error === "apply-incomplete"
              ? "update-incomplete"
              : applied.error === "apply-timed-out"
                ? "update-timed-out"
                : "update-failed",
        report,
      };
    } catch {
      return { ok: false, error: "update-failed" };
    }
  }

  private async repoReport(
    scope: UpdateScope,
    origin: GitOrigin,
  ): Promise<WriteReport> {
    const kept = new Set(scope.desired);
    const landed = await this.deps.selection
      .readTarget(scope.target, origin)
      .catch(() => null);
    const onRelease =
      landed === null || landed.kind !== "root"
        ? null
        : landed.release === scope.chosenRelease;
    const lockfile = await this.deps.deployedContent.readLockfile(scope.target);
    const names = [...new Set([...scope.current, ...scope.desired])];
    const places: WriteReport["places"] = [];
    for (const tool of SUPPORTED_TOOLS) {
      const skills: ReportSkill[] = [];
      for (const name of names) {
        const state = await this.deps.deployedContent
          .classify({
            target: scope.target,
            name,
            tools: [tool],
            release: scope.chosenRelease,
            lockfile,
          })
          .catch(() => "unreadable" as const);
        skills.push(
          reportSkill(
            name,
            kept.has(name)
              ? whereRecorded(KEPT[state], onRelease)
              : DROPPED[state],
          ),
        );
      }
      places.push({ tool, path: null, detected: true, skills });
    }
    return { release: scope.chosenRelease, places };
  }

  accepts(scope: UpdateScope, token: string | undefined): boolean {
    return this.signer.matches(this.token(scope), token);
  }

  private async price(
    target: DeployTarget,
    add?: string,
  ): Promise<
    { ok: true; preview: UpdatePreview; scope: UpdateScope } | PreviewRefusal
  > {
    const tools =
      target.kind === "global"
        ? await this.deps.toolPresence.detectGlobalTools()
        : [];
    if (target.kind === "global" && tools.length === 0) {
      return { ok: false, error: "no-supported-tool" };
    }
    const toolScope = tools.length === 0 ? {} : { tools };

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

    if (add !== undefined && !next.has(add)) {
      return { ok: false, error: "skill-not-in-release" };
    }
    const added =
      add !== undefined && !state.selection.includes(add) ? [add] : [];
    const desired = [
      ...state.selection.filter((name) => next.has(name)),
      ...added,
    ];

    const copies = await this.deps.copyGuard.check({
      write: "update",
      target,
      names: [...state.selection, ...added],
      ...toolScope,
      release: latest.name,
    });
    const decision = this.deps.copyGuard.admits(
      { write: "update", target },
      copies,
    );
    if (!decision.ok && decision.blocked === "linked") {
      return {
        ok: false,
        error: "destination-symlinked",
        linked: decision.linked,
      };
    }
    if (!decision.ok && decision.receipt === null) {
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
    const newInRelease = [...next.keys()].filter(
      (name) =>
        !current.has(name) &&
        !state.selection.includes(name) &&
        !added.includes(name),
    );
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

function whereRecorded(state: RepoState, onRelease: boolean | null): RepoState {
  if (state !== "written" || onRelease === true) {
    return state;
  }
  return onRelease === null ? "not-confirmed" : "not-updated";
}

const reportSkill = (name: string, state: RepoState): ReportSkill =>
  state === "not-updated" ? { name, state, stillAt: null } : { name, state };

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
