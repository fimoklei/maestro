import { join, resolve } from "node:path";
import { type CopyReadingPort, readEach } from "../deploy/copy-reading";
import type { DeployedContentPort, DeployTarget } from "../deploy/deploy-skill";
import {
  type GlobalLayout,
  globalFolders,
  REPO_TOOL_ROOTS,
} from "../deploy/deploy-tools";
import type { GitOrigin } from "../deploy/git-origin";
import type { PendingOperation } from "../deploy/retry-target-operation";
import { type GitHubPage, UNKNOWN_PAGE } from "../git/github-page";
import { resolveHomeDirectory } from "../home-directory";
import {
  type LockfileEntry,
  type LockfileReading,
  parseLockfile,
  readPackage,
  type UnreadableEntry,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import {
  type DeployedPrimitive,
  type PinnedPerSkill,
  type ReleaseHead,
  type SkippedEntry,
  skippedFromReading,
} from "./deploy-state-types";
import {
  type GlobalFolderState,
  type GlobalTargetState,
  type NotUpdatedCopy,
  oneSkillList,
  readGlobalTarget,
  type StrayCopy,
} from "./global-target";
import { harnessPages, latestReleasePage, perSkillPage } from "./harness-pages";
import { harnessSkillPin, type SkillPin, tallyPins } from "./pinned-per-skill";
import { isCopyReading } from "./reading-order";
import type { ReleaseHeadReader } from "./release-head";
import {
  countExtraRootPackageFiles,
  deployedRootPackageSkills,
  skillPrefixes,
} from "./root-package-skills";

type DeployStateResult =
  | {
      ok: true;
      primitives: DeployedPrimitive[];
      skipped: SkippedEntry[];
      releaseHead?: ReleaseHead;
      pinnedPerSkill?: PinnedPerSkill;
      extraFiles?: number;
      pendingOperation?: PendingOperation;
      github?: GitHubPage;
      releaseGitHub?: GitHubPage;
      latestReleaseGitHub?: GitHubPage;
    }
  | { ok: false; error: "malformed" };

type GlobalDeployStateResult =
  | ({
      ok: true;
      skipped: SkippedEntry[];
      otherOrigins: string[];
      pendingOperation?: PendingOperation;
    } & GlobalTargetState)
  | { ok: false; error: "malformed" };

export type DeployStateExtras = {
  releaseHead?: Pick<ReleaseHeadReader, "read">;
  content?: Pick<DeployedContentPort, "classify"> &
    Pick<CopyReadingPort, "harnessHolds">;
  harnessOrigin?: () => Promise<GitOrigin | null>;
  operations?: {
    pending(target: DeployTarget): Promise<PendingOperation | null>;
  };
  githubPage?: (repoPath: string) => Promise<GitHubPage | null>;
  harnessPage?: () => Promise<GitHubPage | null>;
};

export class DeployStateReader {
  protected readonly fs: FileSystemPort;
  protected readonly extras: DeployStateExtras;

  constructor(deps: { fs: FileSystemPort } & DeployStateExtras) {
    this.fs = deps.fs;
    this.extras = {
      releaseHead: deps.releaseHead,
      content: deps.content,
      harnessOrigin: deps.harnessOrigin,
      operations: deps.operations,
      githubPage: deps.githubPage,
      harnessPage: deps.harnessPage,
    };
  }

  protected async connectedOrigin(): Promise<GitOrigin | null> {
    return (await this.extras.harnessOrigin?.().catch(() => null)) ?? null;
  }

  protected connectedPage(): () => Promise<GitHubPage | null> {
    let page: Promise<GitHubPage | null> | undefined;
    return () => {
      page ??= readPage(() => this.extras.harnessPage?.());
      return page;
    };
  }

  async read(repoPath: string): Promise<DeployStateResult> {
    const github = readPage(() => this.extras.githubPage?.(repoPath)).then(
      (page) => (page === null ? {} : { github: page }),
    );
    const raw = await this.fs.readFile(join(repoPath, "apm.lock.yaml"));
    if (raw === null) {
      const unfinished = await this.readPending({ kind: "repo", repoPath });
      return {
        ok: true,
        primitives: [],
        skipped: [],
        ...(unfinished === undefined ? {} : { pendingOperation: unfinished }),
        ...(await github),
      };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, error: "malformed" };
    }

    const primitives: DeployedPrimitive[] = [];
    const skipped: SkippedEntry[] = unreadableAsSkipped(parsed.unreadable);
    const origin = await this.connectedOrigin();
    const harnessPage = this.connectedPage();
    const pins: SkillPin[] = [];
    let root: LockfileEntry | undefined;
    const selection: string[] = [];
    for (const entry of parsed.entries) {
      const reading = readPackage(entry);
      if (reading.kind === "package") {
        root ??= entry;
        continue;
      }
      if (reading.kind !== "skill") {
        skipped.push(skippedFromReading(reading, entry.virtual_path ?? ""));
        continue;
      }
      const pin = harnessSkillPin(entry, origin);
      if (pin !== null) {
        pins.push(pin);
      }
      const github = perSkillPage(entry, reading.name, await harnessPage());
      primitives.push({
        type: "skill",
        name: reading.name,
        version: entry.resolved_ref,
        ...(github === undefined ? {} : { github }),
      });
    }

    const pages =
      root === undefined ? undefined : harnessPages(root, await harnessPage());
    if (root !== undefined) {
      const deployed = await deployedRootPackageSkills(
        root,
        skillPrefixes(REPO_TOOL_ROOTS),
        (file) => this.fs.isFileEntry(join(repoPath, file)),
      );
      for (const name of new Set(deployed.map((skill) => skill.name))) {
        selection.push(name);
        const github = pages?.skill(name);
        primitives.push({
          type: "skill",
          name,
          version: root.resolved_ref,
          ...(github === undefined ? {} : { github }),
        });
      }
    }

    const target: DeployTarget = { kind: "repo", repoPath };
    const pinnedPerSkill = tallyPins(pins);
    const releaseHead =
      root === undefined || pinnedPerSkill !== undefined
        ? undefined
        : await this.readHead(repoPath, root.resolved_ref, selection);
    await this.markCopies(
      primitives,
      target,
      parsed,
      releaseHead?.latestRelease ?? undefined,
    );
    const extraFiles =
      root === undefined
        ? 0
        : countExtraRootPackageFiles(root, skillPrefixes(REPO_TOOL_ROOTS));
    const pendingOperation = await this.readPending(target);
    return {
      ok: true,
      primitives,
      skipped,
      ...(releaseHead === undefined ? {} : { releaseHead }),
      ...(pinnedPerSkill === undefined ? {} : { pinnedPerSkill }),
      ...(extraFiles === 0 ? {} : { extraFiles }),
      ...(pendingOperation === undefined ? {} : { pendingOperation }),
      ...(await github),
      ...(pages === undefined ? {} : { releaseGitHub: pages.release }),
      ...latestPageField(pages?.release, releaseHead),
    };
  }

  protected async readPending(
    target: DeployTarget,
  ): Promise<PendingOperation | undefined> {
    return (
      (await this.extras.operations?.pending(target).catch(() => null)) ??
      undefined
    );
  }

  private async markCopies(
    primitives: DeployedPrimitive[],
    target: DeployTarget,
    lockfile: LockfileReading,
    latestRelease: string | undefined,
  ): Promise<void> {
    const content = this.extras.content;
    if (content === undefined) {
      return;
    }
    await Promise.all(
      primitives.map(async (primitive) => {
        const state = await content
          .classify({
            target,
            name: primitive.name,
            release: latestRelease,
            lockfile,
          })
          .catch(() => null);
        if (state === "diverged") {
          primitive.copy = (await content
            .harnessHolds({ target, name: primitive.name, lockfile })
            .catch(() => false))
            ? "edits-in-harness"
            : "local-edits";
        } else if (state === "unverifiable") {
          primitive.copy = "unverified";
        }
      }),
    );
  }

  protected async readHead(
    key: string,
    release: string,
    selection: readonly string[],
  ): Promise<ReleaseHead | undefined> {
    return await this.extras.releaseHead?.read({ key, release, selection });
  }
}

async function readPage(
  read: () => Promise<GitHubPage | null> | undefined,
): Promise<GitHubPage | null> {
  try {
    return (await read()) ?? null;
  } catch {
    return UNKNOWN_PAGE;
  }
}

function unreadableAsSkipped(
  unreadable: readonly UnreadableEntry[],
): SkippedEntry[] {
  return unreadable.map((entry) => ({
    reason: "unreadable",
    virtualPath: entry.virtualPath,
  }));
}

export class GlobalDeployStateReader extends DeployStateReader {
  private readonly toolPresence: ToolPresencePort;
  private readonly treeRoot: () => string;
  private readonly globalLayout: () => GlobalLayout;
  private readonly copies: CopyReadingPort | undefined;
  private readonly releaseTags:
    | (() => Promise<readonly string[] | null>)
    | undefined;

  constructor(
    deps: {
      fs: FileSystemPort;
      toolPresence: ToolPresencePort;
      treeRoot?: () => string;
      globalLayout: () => GlobalLayout;
      content?: Pick<DeployedContentPort, "classify"> & CopyReadingPort;
      releaseTags?: () => Promise<readonly string[] | null>;
    } & DeployStateExtras,
  ) {
    super(deps);
    this.toolPresence = deps.toolPresence;
    this.copies = deps.content;
    this.releaseTags = deps.releaseTags;
    this.globalLayout = deps.globalLayout;
    this.treeRoot = deps.treeRoot ?? (() => resolveHomeDirectory(process.env));
  }

  // `rootPath` is server-resolved; no client path reaches here.
  async readGlobal(rootPath: string): Promise<GlobalDeployStateResult> {
    const detected = await this.toolPresence.detectGlobalTools();
    const raw = await this.fs.readFile(join(rootPath, "apm.lock.yaml"));
    if (raw === null) {
      const unfinished = await this.readPending({ kind: "global" });
      return {
        ok: true,
        primitives: [],
        folders: globalFolders(detected, this.globalLayout()).map((folder) => ({
          ...folder,
          primitives: [],
        })),
        skipped: [],
        otherOrigins: [],
        ...(unfinished === undefined ? {} : { pendingOperation: unfinished }),
      };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, error: "malformed" };
    }
    const tree = this.treeRoot();
    const { release, skipped, ...target } = await readGlobalTarget(
      parsed.entries,
      detected,
      {
        layout: this.globalLayout(),
        deployments: parsed.deployments,
        fileExists: (file) => this.fs.isFileEntry(resolve(tree, file)),
        origin: await this.connectedOrigin(),
        harnessPage: this.connectedPage(),
      },
    );
    const releaseHead =
      release === undefined || target.pinnedPerSkill !== undefined
        ? undefined
        : await this.readHead(
            "global",
            release,
            target.primitives.map((primitive) => primitive.name),
          );
    await this.readCopies(target.folders, release, parsed, releaseHead);
    const pendingOperation = await this.readPending({ kind: "global" });
    return {
      ok: true,
      ...target,
      primitives: oneSkillList(target.folders),
      ...(releaseHead === undefined ? {} : { releaseHead }),
      ...latestPageField(target.releaseGitHub, releaseHead),
      skipped: [...unreadableAsSkipped(parsed.unreadable), ...skipped],
      ...(pendingOperation === undefined ? {} : { pendingOperation }),
    };
  }

  private async readCopies(
    folders: GlobalFolderState[],
    release: string | undefined,
    lockfile: LockfileReading,
    head: ReleaseHead | undefined,
  ): Promise<void> {
    if (this.copies === undefined) {
      return;
    }
    const latest = head?.latestRelease ?? undefined;
    const tags =
      (await this.releaseTags?.().catch(() => null)) ??
      (latest === undefined ? [] : [latest]);
    const session = this.copies.openReading({
      target: { kind: "global" },
      release,
      tags,
      lockfile,
    });
    const selection = oneSkillList(folders).map((primitive) => primitive.name);
    // A skill with no copy in a written folder has no copy a stray one replaces.
    const written = new Set<string>();
    for (const folder of folders.filter((each) => each.detected)) {
      const held = folder.primitives.map((primitive) => primitive.name);
      const readings = await readEach(
        [...selection.filter((each) => !held.includes(each)), ...held],
        (name) => session.read(name, folder.tool),
      );
      const missing = selection.filter(
        (name) =>
          !held.includes(name) && readings.get(name)?.kind === "missing",
      );
      if (missing.length > 0) {
        folder.missing = missing;
      }
      const notUpdated: NotUpdatedCopy[] = [];
      let targetRelease: string | undefined;
      for (const primitive of folder.primitives) {
        const reading = readings.get(primitive.name) ?? null;
        if (reading?.kind !== "missing") {
          written.add(primitive.name);
        }
        if (reading !== null && isCopyReading(reading.kind)) {
          primitive.copy = reading.kind;
        } else if (reading?.kind === "not-updated") {
          notUpdated.push({ name: primitive.name, stillAt: reading.stillAt });
          targetRelease = reading.targetRelease;
        }
      }
      if (targetRelease !== undefined) {
        folder.notUpdated = { targetRelease, copies: notUpdated };
      }
    }
    for (const folder of folders.filter(
      (each) => !each.detected && each.former !== true,
    )) {
      const readings = await readEach(written, (name) =>
        session.read(name, folder.tool),
      );
      // An unread copy is still shown; only a proven equal raises no Status.
      const strayCopies: StrayCopy[] = [...readings]
        .filter(([, reading]) => reading?.kind !== "missing")
        .map(([name, reading]) => ({
          name,
          atRelease: reading?.kind === "at-release",
        }));
      if (strayCopies.length > 0) {
        folder.strayCopies = strayCopies;
      }
    }
  }
}

function latestPageField(
  release: GitHubPage | undefined,
  head: ReleaseHead | undefined,
): { latestReleaseGitHub?: GitHubPage } {
  const page =
    head === undefined ? undefined : latestReleasePage(release, head);
  return page === undefined ? {} : { latestReleaseGitHub: page };
}
