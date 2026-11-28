import type { FileSystemPort } from "../registry/file-system";
import type { ConsentedCopy, CopySetAside } from "./copy-set-aside";
import type { ApmDriverPort, DeployTarget } from "./deploy-skill";
import { SUPPORTED_TOOLS, type SupportedTool } from "./deploy-tools";
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
  key: string;
  kind: TargetOperationKind;
  origin: GitOrigin;
  release: string;
  previous: readonly string[];
  desired: readonly string[];
  tools?: readonly SupportedTool[];
  consented: readonly ConsentedCopy[];
};

type SelectionError =
  | "manifest-not-recognised"
  | "manifest-legacy-entry"
  | "destination-symlinked"
  | "apply-incomplete"
  | "apply-timed-out"
  | "apply-failed";

export type SelectionResult =
  | { ok: true }
  | { ok: false; error: SelectionError };

export type ApplySelectionDeps = {
  fs: Pick<FileSystemPort, "readFile" | "writeFile" | "isFileEntry">;
  location: Pick<
    DeployedLocation,
    "lockfilePath" | "manifestPath" | "treeRoot" | "toolRoots"
  >;
  apm: Pick<ApmDriverPort, "deploySkill" | "removeSkill">;
  operations: Pick<TargetOperationStore, "begin" | "clear" | "read">;
  setAside: Pick<CopySetAside, "plan" | "moveAside" | "settle">;
};

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

  async settleSetAside(
    target: DeployTarget,
    operation: TargetOperation,
  ): Promise<void> {
    await this.deps.setAside.settle(
      target,
      operation.release,
      operation.setAside ?? [],
    );
  }
}

async function applySelection(
  deps: ApplySelectionDeps,
  write: SelectionWrite,
): Promise<SelectionResult> {
  const manifestPath = deps.location.manifestPath(write.target);
  const before = await deps.fs.readFile(manifestPath);
  const reading = readHarnessSelection(before, write.origin.ownerRepo);
  if (reading.kind === "not-recognised") {
    return { ok: false, error: "manifest-not-recognised" };
  }
  if (reading.kind === "legacy-entry") {
    return { ok: false, error: "manifest-legacy-entry" };
  }

  const setAside = deps.setAside.plan(write.consented, write.desired);
  await deps.operations.begin({
    key: write.key,
    target: write.target,
    harness: write.origin.ownerRepo,
    kind: write.kind,
    release: write.release,
    previous: [...write.previous],
    desired: [...write.desired],
    tools: write.tools === undefined ? null : [...write.tools],
    setAside,
  });

  let result: SelectionResult;
  try {
    await deps.setAside.moveAside(write.target, setAside);
    result = await install(deps, write, reading, before);
  } finally {
    await deps.setAside.settle(write.target, write.release, setAside);
  }
  if (result.ok) {
    await deps.operations.clear(write.key);
  }
  return result;
}

async function install(
  deps: ApplySelectionDeps,
  write: SelectionWrite,
  reading: ReturnType<typeof readHarnessSelection>,
  before: string | null,
): Promise<SelectionResult> {
  const manifestPath = deps.location.manifestPath(write.target);
  const ref = buildHarnessPackageRef({
    host: write.origin.host,
    ownerRepo: write.origin.ownerRepo,
    tag: write.release,
  });

  if (write.desired.length === 0) {
    const removed = await deps.apm.removeSkill({ target: write.target, ref });
    return await verify(deps, write, refusalFor(removed));
  }

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
    return { ok: false, error: "destination-symlinked" };
  }
  return await verify(deps, write, refusalFor(installed));
}

function refusalFor(
  ran: { ok: true } | { ok: false; reason?: string },
): SelectionError | null {
  if (ran.ok) {
    return null;
  }
  return ran.reason === "timed-out"
    ? "apply-timed-out"
    : ran.reason === "destination-symlinked"
      ? "destination-symlinked"
      : "apply-failed";
}

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
  if (landed.kind !== "root" || landed.release !== write.release) {
    return false;
  }
  const tools = write.tools ?? SUPPORTED_TOOLS;
  const written = landed.copies
    .filter((copy) => tools.includes(copy.tool))
    .map((copy) => copy.name);
  if (!sameNames([...new Set(written)], write.desired)) {
    return false;
  }
  const everyCopy = tools.every((tool) =>
    write.desired.every((name) =>
      landed.copies.some((copy) => copy.tool === tool && copy.name === name),
    ),
  );
  if (!everyCopy) {
    return false;
  }
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
