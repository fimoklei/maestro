// The one owner of a Selection change — see ADR-0031 § How the code follows it.
import type { FileSystemPort } from "../registry/file-system";
import type { ApmDriverPort, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import type { DeployedLocation } from "./deployed-location";
import type { GitOrigin } from "./git-origin";
import {
  readHarnessSelection,
  writeHarnessSelection,
} from "./harness-manifest";
import { buildHarnessPackageRef } from "./package-ref";
import type {
  TargetOperation,
  TargetOperationKind,
  TargetOperationStore,
} from "./target-operation";
import { readTargetSelection, type TargetSelection } from "./target-selection";

export type SelectionWrite = {
  target: DeployTarget;
  // The target's lock key, which is also the operation record's key.
  key: string;
  kind: TargetOperationKind;
  origin: GitOrigin;
  release: string;
  previous: readonly string[];
  // Empty only on a removal: apm refuses `skills: []`, so an empty Selection is
  // expressed as the named uninstall instead (apm-behavior.md § Root package).
  desired: readonly string[];
  tools?: readonly SupportedTool[];
};

// "apply-incomplete" is the state the operation record exists for: apm ran and
// what is on disk is not what was asked for, so the target keeps its unfinished
// operation and a retry converges on it.
type SelectionError =
  | "manifest-not-recognised"
  | "destination-symlinked"
  | "apply-incomplete"
  | "apply-failed";

export type SelectionResult =
  | { ok: true }
  | { ok: false; error: SelectionError };

export type ApplySelectionDeps = {
  fs: Pick<FileSystemPort, "readFile" | "writeFile" | "isFileEntry">;
  location: Pick<
    DeployedLocation,
    "lockfilePath" | "manifestPath" | "treeRoot"
  >;
  apm: Pick<ApmDriverPort, "deploySkill" | "removeSkill">;
  operations: Pick<TargetOperationStore, "begin" | "clear" | "read">;
};

// The seam both write use-cases hold: one object carrying the lockfile read,
// the unfinished-operation read and the write itself, so neither has to know
// which ports the Selection lifecycle needs (#951).
export class SelectionWriter {
  private readonly deps: ApplySelectionDeps & {
    operations: TargetOperationStore;
  };

  constructor(deps: ApplySelectionDeps & { operations: TargetOperationStore }) {
    this.deps = deps;
  }

  async readTarget(
    target: DeployTarget,
    origin: GitOrigin,
  ): Promise<TargetSelection> {
    return await readTargetSelection({
      fs: this.deps.fs,
      location: this.deps.location,
      target,
      origin,
    });
  }

  async pending(key: string): Promise<TargetOperation | null> {
    return await this.deps.operations.read(key);
  }

  async apply(write: SelectionWrite): Promise<SelectionResult> {
    return await applySelection(this.deps, write);
  }
}

export async function applySelection(
  deps: ApplySelectionDeps,
  write: SelectionWrite,
): Promise<SelectionResult> {
  const manifestPath = deps.location.manifestPath(write.target);
  const before = await deps.fs.readFile(manifestPath);
  const reading = readHarnessSelection(before, write.origin.ownerRepo);
  // Before the record and before apm: a shape Maestro will not edit stops the
  // whole write rather than leaving a half-stated intent behind (ADR-0031).
  if (reading.kind === "not-recognised") {
    return { ok: false, error: "manifest-not-recognised" };
  }

  await deps.operations.begin({
    key: write.key,
    target: write.target,
    harness: write.origin.ownerRepo,
    kind: write.kind,
    release: write.release,
    previous: [...write.previous],
    desired: [...write.desired],
    tools: write.tools === undefined ? null : [...write.tools],
  });

  const ref = buildHarnessPackageRef({
    host: write.origin.host,
    ownerRepo: write.origin.ownerRepo,
    tag: write.release,
  });

  if (write.desired.length === 0) {
    const removed = await deps.apm.removeSkill({ target: write.target, ref });
    // The exit code and the marker say nothing about disk: a blocked uninstall
    // deletes the rest of the Selection first (apm-behavior.md § Root package).
    return await verify(deps, write, removed.ok ? null : "apply-failed");
  }

  // `--skill` only unions with the persisted list, so the exact Selection has
  // to be in `skills:` before the install. An absent dependency is left to apm,
  // which creates it from the flags alone (§ Root package, ADR-0031).
  if (reading.kind === "selection" && before !== null) {
    const rewritten = writeHarnessSelection(
      before,
      write.origin.ownerRepo,
      write.desired,
    );
    if (rewritten === null) {
      return { ok: false, error: "manifest-not-recognised" };
    }
    await deps.fs.writeFile(manifestPath, rewritten);
  }

  const installed = await deps.apm.deploySkill({
    target: write.target,
    ref,
    skills: [...write.desired],
    ...(write.tools === undefined ? {} : { tools: write.tools }),
  });
  if (!installed.ok && installed.reason === "destination-symlinked") {
    // apm wrote nothing, and the reader is told which link to delete; the
    // record stays so the retry is the same one attempt.
    return { ok: false, error: "destination-symlinked" };
  }
  return await verify(deps, write, installed.ok ? null : "apply-failed");
}

// Completion is disk plus the deployment record plus the manifest agreeing with
// the desired Selection. A matching tag alone proves nothing (#951).
async function verify(
  deps: ApplySelectionDeps,
  write: SelectionWrite,
  refusal: SelectionError | null,
): Promise<SelectionResult> {
  const landed = await readTargetSelection({
    fs: deps.fs,
    location: deps.location,
    target: write.target,
    origin: write.origin,
  });
  if (!(await matches(deps, write, landed))) {
    return { ok: false, error: refusal ?? "apply-incomplete" };
  }
  await deps.operations.clear(write.key);
  return { ok: true };
}

async function matches(
  deps: ApplySelectionDeps,
  write: SelectionWrite,
  landed: Awaited<ReturnType<typeof readTargetSelection>>,
): Promise<boolean> {
  if (write.desired.length === 0) {
    return landed.kind === "empty";
  }
  if (
    landed.kind !== "root" ||
    landed.release !== write.release ||
    !sameNames(landed.deployed, write.desired)
  ) {
    return false;
  }
  // The manifest is what the next install reads, so a name it still holds is an
  // unfinished removal even when this run's files look right.
  const manifest = readHarnessSelection(
    await deps.fs.readFile(deps.location.manifestPath(write.target)),
    write.origin.ownerRepo,
  );
  return (
    manifest.kind === "selection" && sameNames(manifest.skills, write.desired)
  );
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
  const wanted = new Set(right);
  return left.length === wanted.size && left.every((name) => wanted.has(name));
}
