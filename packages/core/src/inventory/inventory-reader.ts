// Reads the central inventory from the local clone's latest release, never the
// working tree and never the network. A malformed SKILL.md is skipped.
import { z } from "zod";
import { parseGitOrigin } from "../deploy/git-origin";
import { readFrontmatter } from "../harness/validate-skill-structure";
import type { FileSystemPort } from "../registry/file-system";
import type { ReadReleasedSkills } from "./released-skills";

type Primitive = { type: "skill"; name: string; description: string };

// An empty `primitives` only ever means a successful read found no released
// skill; `unreadable` is a connected harness whose release could not be read.
export type InventoryResult =
  | { ok: true; primitives: Primitive[] }
  | { ok: false; error: "not-configured" | "unreadable" };

// The frontmatter `name` is prose; the directory name is the identity.
const frontmatterSchema = z.object({
  description: z.string(),
});

function parseSkillFrontmatter(raw: string): { description: string } | null {
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return null;
  }
  const result = frontmatterSchema.safeParse(frontmatter.data);
  return result.success ? result.data : null;
}

export class InventoryReader {
  private readonly fs: FileSystemPort;
  private readonly resolvePath: () =>
    | Promise<string | undefined>
    | (string | undefined);
  private readonly originUrl: (
    path: string,
  ) => Promise<string | null> | string | null;
  private readonly readReleasedSkills: ReadReleasedSkills;

  constructor(deps: {
    fs: FileSystemPort;
    resolvePath: () => Promise<string | undefined> | (string | undefined);
    originUrl?: (path: string) => Promise<string | null> | string | null;
    readReleasedSkills: ReadReleasedSkills;
  }) {
    this.fs = deps.fs;
    this.resolvePath = deps.resolvePath;
    this.originUrl = deps.originUrl ?? (() => null);
    this.readReleasedSkills = deps.readReleasedSkills;
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
    return { inventoryPath, githubRepository };
  }

  async read(): Promise<InventoryResult> {
    const root = await this.resolvePath();
    if (root === undefined || !(await this.fs.isDirectory(root))) {
      return { ok: false, error: "not-configured" };
    }

    const released = await this.readReleasedSkills(root).catch(() => null);
    if (released === null) {
      return { ok: false, error: "unreadable" };
    }

    const primitives: Primitive[] = [];
    for (const { name, manifest } of released) {
      if (manifest === null) {
        continue;
      }
      const parsed = parseSkillFrontmatter(manifest);
      if (parsed === null) {
        continue;
      }
      primitives.push({
        type: "skill",
        name,
        description: parsed.description,
      });
    }
    return { ok: true, primitives };
  }
}
