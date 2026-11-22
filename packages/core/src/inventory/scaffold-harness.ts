import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { FileSystemPort } from "../registry/file-system";
import { type RepoPathError, validateRepoPath } from "../registry/repo-path";
import type { ConnectInventoryResult } from "./connect-inventory";
import { HARNESS_MANIFEST } from "./harness-layout";
import {
  canonicalHarnessFiles,
  SCAFFOLD_ENTRIES,
  SCAFFOLD_ROOTS,
  type ScaffoldFile,
} from "./harness-scaffold-files";
import type { HarnessScaffoldGitPort } from "./harness-scaffold-git";
import type { ScaffoldOffers } from "./scaffold-offers";

const COMMIT_MESSAGE = "Scaffold the Harness";

export type ScaffoldHarnessError =
  | RepoPathError
  | "not-offered"
  | "not-a-repository"
  | "already-a-harness"
  | "path-occupied"
  | "no-default-branch"
  | "not-on-default-branch"
  | "busy"
  | "write-failed"
  | "commit-failed"
  | "push-rejected"
  | "push-offline"
  | "connect-failed";

export type ScaffoldHarnessResult =
  | { ok: true; outcome: "scaffolded"; inventoryPath: string }
  | { ok: false; error: "path-occupied"; path: string }
  | { ok: false; error: Exclude<ScaffoldHarnessError, "path-occupied"> };

export class ScaffoldHarness {
  private readonly fs: FileSystemPort;
  private readonly git: HarnessScaffoldGitPort;
  private readonly locks: InFlightLocks;
  private readonly offers: ScaffoldOffers;
  private readonly originUrl: (path: string) => Promise<string | null>;
  private readonly connect: (path: string) => Promise<ConnectInventoryResult>;

  constructor(deps: {
    fs: FileSystemPort;
    git: HarnessScaffoldGitPort;
    locks: InFlightLocks;
    offers: ScaffoldOffers;
    originUrl: (path: string) => Promise<string | null>;
    connect: (path: string) => Promise<ConnectInventoryResult>;
  }) {
    this.fs = deps.fs;
    this.git = deps.git;
    this.locks = deps.locks;
    this.offers = deps.offers;
    this.originUrl = deps.originUrl;
    this.connect = deps.connect;
  }

  async scaffold(input: string): Promise<ScaffoldHarnessResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    if (!this.offers.holds(validated.path)) {
      return { ok: false, error: "not-offered" };
    }
    const run = await this.locks.run(validated.path, () =>
      this.scaffoldValidated(validated.path),
    );
    return run.ok ? run.value : { ok: false, error: "busy" };
  }

  private async scaffoldValidated(
    root: string,
  ): Promise<ScaffoldHarnessResult> {
    const originUrl = await this.originUrl(root);
    const origin = originUrl === null ? null : parseGitOrigin(originUrl);
    if (origin === null || !(await this.git.isRepositoryRoot(root))) {
      return { ok: false, error: "not-a-repository" };
    }
    if (await this.fs.isFileEntry(join(root, HARNESS_MANIFEST))) {
      return { ok: false, error: "already-a-harness" };
    }

    const branch = await this.scaffoldBranch(root);
    if (branch === null) {
      return { ok: false, error: "no-default-branch" };
    }
    if ((await this.git.currentBranch(root)) !== branch) {
      return { ok: false, error: "not-on-default-branch" };
    }

    const occupied = await this.occupiedEntry(root);
    if (occupied !== null) {
      return { ok: false, error: "path-occupied", path: occupied };
    }

    const files = canonicalHarnessFiles(origin.ownerRepo);
    const createdSkippable: string[] = [];
    const written = await this.writeFiles(root, files, createdSkippable);
    if (written !== null) {
      return written;
    }

    const paths = files.map((file) => file.path);
    if ((await this.git.commit(root, paths, COMMIT_MESSAGE)) !== "committed") {
      await this.git.unstage(root, paths);
      await this.rollback(root, createdSkippable);
      return { ok: false, error: "commit-failed" };
    }

    const pushed = await this.git.push(root, branch);
    if (pushed !== "pushed") {
      return {
        ok: false,
        error: pushed === "offline" ? "push-offline" : "push-rejected",
      };
    }
    await this.git.setOriginHead(root, branch);

    const connected = await this.connect(root);
    return connected.ok
      ? { ok: true, outcome: "scaffolded", inventoryPath: root }
      : { ok: false, error: "connect-failed" };
  }

  private async scaffoldBranch(root: string): Promise<string | null> {
    const known = await this.git.defaultBranch(root);
    if (known !== null) {
      return known;
    }
    return (await this.git.hasCommits(root))
      ? null
      : await this.git.currentBranch(root);
  }

  private async writeFiles(
    root: string,
    files: ScaffoldFile[],
    createdSkippable: string[],
  ): Promise<ScaffoldHarnessResult | null> {
    for (const file of files) {
      let created: boolean;
      try {
        created = await this.fs.createNewFile(
          join(root, file.path),
          file.contents,
        );
      } catch {
        await this.rollback(root, createdSkippable);
        return { ok: false, error: "write-failed" };
      }
      if (!created) {
        if (file.skipIfExists) {
          continue;
        }
        await this.rollback(root, createdSkippable);
        return { ok: false, error: "path-occupied", path: file.path };
      }
      if (file.skipIfExists) {
        createdSkippable.push(file.path);
      }
    }
    return null;
  }

  private async rollback(
    root: string,
    createdSkippable: string[] = [],
  ): Promise<void> {
    for (const entry of [...SCAFFOLD_ROOTS, ...createdSkippable]) {
      await this.fs.remove(join(root, entry));
    }
  }

  private async occupiedEntry(root: string): Promise<string | null> {
    for (const entry of SCAFFOLD_ENTRIES) {
      if (await this.fs.exists(join(root, entry))) {
        return entry;
      }
    }
    return null;
  }
}
