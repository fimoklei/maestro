// Reads the central inventory from the local clone, never the network. A
// malformed SKILL.md is skipped, so one bad skill cannot hide the rest.
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { FileSystemPort } from "../registry/file-system";

export type Primitive = { type: "skill"; name: string; description: string };

// One failure only: inventoryPath unset, missing, or not a directory.
export type InventoryResult =
  | { ok: true; primitives: Primitive[] }
  | { ok: false; error: "not-configured" };

const frontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
});

// Null on anything malformed, so the caller can skip the skill.
function parseSkillFrontmatter(
  raw: string,
): { name: string; description: string } | null {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  const block = match?.[1];
  if (block === undefined) {
    return null;
  }
  let data: unknown;
  try {
    data = parse(block);
  } catch {
    return null;
  }
  const result = frontmatterSchema.safeParse(data);
  return result.success ? result.data : null;
}

export class InventoryReader {
  private readonly fs: FileSystemPort;
  // A thunk, so the path is resolved per read and never frozen at construction.
  private readonly resolvePath: () =>
    | Promise<string | undefined>
    | (string | undefined);

  constructor(deps: {
    fs: FileSystemPort;
    resolvePath: () => Promise<string | undefined> | (string | undefined);
  }) {
    this.fs = deps.fs;
    this.resolvePath = deps.resolvePath;
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

  async read(): Promise<InventoryResult> {
    const root = await this.resolvePath();
    if (root === undefined || !(await this.fs.isDirectory(root))) {
      return { ok: false, error: "not-configured" };
    }

    const skillsDir = join(root, "skills");
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
        name: parsed.name,
        description: parsed.description,
      });
    }
    return { ok: true, primitives };
  }
}
