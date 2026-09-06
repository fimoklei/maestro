// Reads the central inventory from the local clone, never the network. A
// malformed SKILL.md is skipped, so one bad skill cannot hide the rest.
import { join } from "node:path";
import { z } from "zod";
import { parseGitOrigin } from "../deploy/git-origin";
import { readFrontmatter } from "../harness/validate-skill-structure";
import type { FileSystemPort } from "../registry/file-system";
import { HARNESS_SKILLS_DIR } from "./harness-layout";

type Primitive = { type: "skill"; name: string; description: string };

// One failure only: inventoryPath unset, missing, or not a directory.
export type InventoryResult =
  | { ok: true; primitives: Primitive[] }
  | { ok: false; error: "not-configured" };

// `name` is prose, not identity — the directory under .apm/skills/ decides that
// (ADR-0021 §4), so only the description is read here.
const frontmatterSchema = z.object({
  description: z.string(),
});

// Null on anything malformed, so the caller can skip the skill. Extraction is
// the release validator's, so one manifest never reads two ways.
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
  // A thunk, so the path is resolved per read and never frozen at construction.
  private readonly resolvePath: () =>
    | Promise<string | undefined>
    | (string | undefined);
  private readonly originUrl: (
    path: string,
  ) => Promise<string | null> | string | null;

  constructor(deps: {
    fs: FileSystemPort;
    resolvePath: () => Promise<string | undefined> | (string | undefined);
    originUrl?: (path: string) => Promise<string | null> | string | null;
  }) {
    this.fs = deps.fs;
    this.resolvePath = deps.resolvePath;
    this.originUrl = deps.originUrl ?? (() => null);
  }

  // Canonicalised where possible, so the browser's path comparisons line up
  // with server-side registration.
  async configuredPath(): Promise<string | null> {
    const path = await this.resolvePath();
    if (path === undefined) {
      return null;
    }
    return this.fs.realpath(path).catch(() => path);
  }

  // The configured URL names the durable GitHub repository; a transport
  // rewrite is local plumbing and must not replace that fact on the screen.
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

    const skillsDir = join(root, HARNESS_SKILLS_DIR);
    const entries = await this.fs.listRawEntries(skillsDir);
    const primitives: Primitive[] = [];
    for (const { name } of entries.filter((entry) => entry.isDirectory)) {
      const raw = await this.fs.readFile(join(skillsDir, name, "SKILL.md"));
      if (raw === null) {
        continue;
      }
      const parsed = parseSkillFrontmatter(raw);
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
