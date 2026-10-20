// Reads the central inventory from the local clone's latest release, never the
// working tree and never the network. A malformed SKILL.md is skipped; a
// prompt with missing or broken frontmatter is listed with no description.
import { z } from "zod";
import { parseGitOrigin } from "../deploy/git-origin";
import { isValidSkillSlug } from "../deploy/package-ref";
import { type GitHubPage, githubPageFromOriginUrl } from "../git/github-page";
import { primitivePath } from "../harness/harness-primitive";
import {
  readFrontmatter,
  splitFrontmatter,
} from "../harness/validate-skill-structure";
import type { FileSystemPort } from "../registry/file-system";
import {
  type PendingRelease,
  type PendingReleaseDelta,
  pendingReleaseOf,
  type ReadPendingRelease,
} from "./pending-release";
import type { ReadReleasedPrimitives } from "./released-primitives";

// `path` is where the primitive lives in the Harness. `pendingRelease` is a
// merged change to it that waits for the next release.
export type InventorySkill = {
  type: "skill";
  name: string;
  description: string;
  path: string;
  pendingRelease: PendingRelease;
};

// `text` is what Copy prompt copies. `nameValid` is false for a file name that
// breaks the name rule; the prompt is still listed and copyable.
export type InventoryPrompt = {
  type: "prompt";
  name: string;
  description: string;
  path: string;
  pendingRelease: PendingRelease;
  text: string;
  nameValid: boolean;
};

export type InventoryPrimitive = InventorySkill | InventoryPrompt;

// An empty `primitives` only ever means a successful read found nothing
// released; `unreadable` is a connected harness whose release could not be read.
export type InventoryResult =
  | { ok: true; primitives: InventoryPrimitive[] }
  | { ok: false; error: "not-configured" | "unreadable" };

// The frontmatter `name` is prose; the directory name is the identity.
const frontmatterSchema = z.object({
  description: z.string(),
});

function parseDescription(raw: string): string | null {
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return null;
  }
  const result = frontmatterSchema.safeParse(frontmatter.data);
  return result.success ? result.data.description : null;
}

// The text after a closed frontmatter block, byte for byte; else the whole file.
const promptOf = (
  name: string,
  raw: string,
  pending: PendingReleaseDelta | null,
): InventoryPrompt => ({
  type: "prompt",
  name,
  description: parseDescription(raw) ?? "",
  path: primitivePath({ type: "prompt", name }),
  pendingRelease: pendingReleaseOf({ type: "prompt", name }, pending),
  text: splitFrontmatter(raw)?.body ?? raw,
  nameValid: isValidSkillSlug(name),
});

export class InventoryReader {
  private readonly fs: FileSystemPort;
  private readonly resolvePath: () =>
    | Promise<string | undefined>
    | (string | undefined);
  private readonly originUrl: (
    path: string,
  ) => Promise<string | null> | string | null;
  private readonly readReleased: ReadReleasedPrimitives;
  private readonly readPendingRelease: ReadPendingRelease;

  constructor(deps: {
    fs: FileSystemPort;
    resolvePath: () => Promise<string | undefined> | (string | undefined);
    originUrl?: (path: string) => Promise<string | null> | string | null;
    readReleased: ReadReleasedPrimitives;
    readPendingRelease: ReadPendingRelease;
  }) {
    this.fs = deps.fs;
    this.resolvePath = deps.resolvePath;
    this.originUrl = deps.originUrl ?? (() => null);
    this.readReleased = deps.readReleased;
    this.readPendingRelease = deps.readPendingRelease;
  }

  // Canonicalised, so browser path comparisons match server registration.
  async configuredPath(): Promise<string | null> {
    const path = await this.resolvePath();
    if (path === undefined) {
      return null;
    }
    return this.fs.realpath(path).catch(() => path);
  }

  // The configured URL, never an `insteadOf` rewrite of it.
  async configuredLocation(): Promise<{
    inventoryPath: string | null;
    githubRepository: string | null;
    github?: GitHubPage;
  }> {
    const inventoryPath = await this.configuredPath();
    if (inventoryPath === null) {
      return { inventoryPath, githubRepository: null };
    }

    const originUrl = await Promise.resolve(
      this.originUrl(inventoryPath),
    ).catch(() => null);
    const githubRepository =
      originUrl === null
        ? null
        : (parseGitOrigin(originUrl)?.ownerRepo ?? null);
    const github = githubPageFromOriginUrl(originUrl) ?? undefined;
    return { inventoryPath, githubRepository, github };
  }

  async read(): Promise<InventoryResult> {
    const root = await this.resolvePath();
    if (root === undefined || !(await this.fs.isDirectory(root))) {
      return { ok: false, error: "not-configured" };
    }

    // Fail-closed: a thrown git call is an unread release, never an empty one.
    const released = await this.readReleased(root).catch(() => null);
    if (released === null) {
      return { ok: false, error: "unreadable" };
    }
    // The release still lists without its pending facts.
    const pending = await this.readPendingRelease(root).catch(() => null);

    const primitives: InventoryPrimitive[] = [];
    for (const { name, manifest } of released.skills) {
      const description = manifest === null ? null : parseDescription(manifest);
      if (description === null) {
        continue;
      }
      primitives.push({
        type: "skill",
        name,
        description,
        path: primitivePath({ type: "skill", name }),
        pendingRelease: pendingReleaseOf({ type: "skill", name }, pending),
      });
    }
    for (const { name, text } of released.prompts) {
      primitives.push(promptOf(name, text, pending));
    }
    return { ok: true, primitives };
  }
}
