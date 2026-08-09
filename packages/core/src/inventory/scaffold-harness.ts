// Turns an empty GitHub repository into a Harness: the canonical shape, one
// commit carrying only that shape, and a push to the branch git reports as the
// default. No tag — v0.1.0 releases skill content (#556, ADR-0021).
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

// `push-rejected` and `push-offline` are expected outcomes, not defects: the
// commit is deliberately left in the clone so the user can push it themselves.
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
    // The same register connect writes its offers to, so the two agree on
    // which repositories this server has proposed scaffolding.
    offers: ScaffoldOffers;
    originUrl: (path: string) => Promise<string | null>;
    // The same use case the gate connects with, so a scaffolded Harness passes
    // exactly the checks a joined one does.
    connect: (path: string) => Promise<ConnectInventoryResult>;
  }) {
    this.fs = deps.fs;
    this.git = deps.git;
    this.locks = deps.locks;
    this.offers = deps.offers;
    this.originUrl = deps.originUrl;
    this.connect = deps.connect;
  }

  // Serialized on the canonical root: two scaffolds of one repository would
  // interleave their collision checks and their writes. In-process only —
  // another process on the same clone is caught by the exclusive create below.
  async scaffold(input: string): Promise<ScaffoldHarnessResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    // An arbitrary path would otherwise buy a write, a commit and a push into
    // any reachable clone; only a repository connect just offered qualifies.
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
    // Repository truth again, never trusted from the offer that carried it
    // here: this endpoint takes a path from the client (security.md).
    const originUrl = await this.originUrl(root);
    const origin = originUrl === null ? null : parseGitOrigin(originUrl);
    // The root, not merely somewhere inside a clone: the origin read above
    // answers from the enclosing repository, and scaffolding a subdirectory
    // would push to a repository the user never pointed at (#556).
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
    // The commit lands on the checked-out branch, so scaffolding from anywhere
    // else would push a branch the user never chose (#552 G4).
    if ((await this.git.currentBranch(root)) !== branch) {
      return { ok: false, error: "not-on-default-branch" };
    }

    const occupied = await this.occupiedEntry(root);
    if (occupied !== null) {
      return { ok: false, error: "path-occupied", path: occupied };
    }

    const files = canonicalHarnessFiles(origin.ownerRepo);
    const written = await this.writeFiles(root, files);
    if (written !== null) {
      return written;
    }

    const paths = files.map((file) => file.path);
    if ((await this.git.commit(root, paths, COMMIT_MESSAGE)) !== "committed") {
      // Without this the retry the message asks for meets the apm.yml this
      // attempt left behind, and is refused as already-a-harness (#556).
      await this.git.unstage(root, paths);
      await this.rollback(root);
      return { ok: false, error: "commit-failed" };
    }

    const pushed = await this.git.push(root, branch);
    if (pushed !== "pushed") {
      return {
        ok: false,
        error: pushed === "offline" ? "push-offline" : "push-rejected",
      };
    }
    // An empty clone never got `refs/remotes/origin/HEAD`, and the push does
    // not write it either (#552 G3) — so connect could not name the branch.
    await this.git.setOriginHead(root, branch);

    const connected = await this.connect(root);
    return connected.ok
      ? { ok: true, outcome: "scaffolded", inventoryPath: root }
      : { ok: false, error: "connect-failed" };
  }

  // Origin's default, or the branch an unborn HEAD sits on. The fallback holds
  // only while the repository is empty, where the clone landed on the branch
  // the remote advertised (#552 G2).
  private async scaffoldBranch(root: string): Promise<string | null> {
    const known = await this.git.defaultBranch(root);
    if (known !== null) {
      return known;
    }
    return (await this.git.hasCommits(root))
      ? null
      : await this.git.currentBranch(root);
  }

  // Null when every file was created. Anything else is the typed refusal, with
  // the partial tree already removed.
  private async writeFiles(
    root: string,
    files: ScaffoldFile[],
  ): Promise<ScaffoldHarnessResult | null> {
    for (const file of files) {
      let created: boolean;
      try {
        created = await this.fs.createNewFile(
          join(root, file.path),
          file.contents,
        );
      } catch {
        await this.rollback(root);
        return { ok: false, error: "write-failed" };
      }
      if (!created) {
        // occupiedEntry saw nothing here, so this path arrived since — from
        // another process, which the in-process lock cannot serialize.
        await this.rollback(root);
        return { ok: false, error: "path-occupied", path: file.path };
      }
    }
    return null;
  }

  private async rollback(root: string): Promise<void> {
    for (const entry of SCAFFOLD_ROOTS) {
      await this.fs.remove(join(root, entry));
    }
  }

  // The first entry already on disk, repository-relative and nothing else
  // (#556). Parents count: an existing `.github/` is a directory the scaffold
  // would write into.
  private async occupiedEntry(root: string): Promise<string | null> {
    for (const entry of SCAFFOLD_ENTRIES) {
      if (await this.fs.exists(join(root, entry))) {
        return entry;
      }
    }
    return null;
  }
}
