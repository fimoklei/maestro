// Imports the skill folders directly inside one chosen folder, each through
// ImportSkill's own judgement and copy: no branch, commit or push.
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { FileSystemPort } from "../registry/file-system";
import {
  addBlocker,
  type ImportSkill,
  type ImportSkillError,
  type ImportSourceBlocker,
} from "./import-skill";
import { proposeSkillSlug } from "./skill-slug";

/** One folder inside the chosen one: its directory entry, its skill name, and why it cannot land. */
export type SkillFolder = {
  entry: string;
  name: string;
  refusal: ImportSkillError | null;
};

/** What the chosen folder holds; `folderBlocker` refuses the folder itself and lists nothing. */
export type SkillFolderScan = {
  folderBlocker: ImportSourceBlocker | null;
  folders: SkillFolder[];
};

export type ImportSkillsInput = { source: string; entries: readonly string[] };

export type ImportSkillsError = "not-configured" | "import-in-progress";

export type ScanSkillFoldersResult =
  | { ok: true; scan: SkillFolderScan }
  | { ok: false; error: "not-configured" };

export type ImportSkillsResult =
  | { ok: true; outcomes: SkillFolder[] }
  | { ok: false; error: ImportSkillsError };

// The chosen folder answers to the single import's source rules only; it
// need not be a skill itself.
const FOLDER_BLOCKERS = new Set<ImportSourceBlocker>([
  "source-unreadable",
  "outside-root",
  "deployed-copy",
  "origin-unproven",
]);

type Listing =
  | { ok: true; folder: string; entries: string[] }
  | { ok: false; blocker: ImportSourceBlocker };

export class ImportSkills {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: Pick<FileSystemPort, "realpath" | "isDirectory" | "listRawEntries">;
    importSkill: Pick<ImportSkill, "check" | "add">;
    // The Harness lock Delete and Restore take.
    locks: InFlightLocks;
  };

  constructor(deps: ImportSkills["deps"]) {
    this.deps = deps;
  }

  async scan(source: string): Promise<ScanSkillFoldersResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const listing = await this.list(source);
    if (listing === null) {
      return { ok: false, error: "not-configured" };
    }
    if (!listing.ok) {
      return {
        ok: true,
        scan: { folderBlocker: listing.blocker, folders: [] },
      };
    }
    const folders: SkillFolder[] = [];
    for (const entry of listing.entries) {
      const name = proposeSkillSlug(entry);
      const checked = await this.deps.importSkill.check({
        source: join(listing.folder, entry),
        name,
      });
      if (!checked.ok) {
        return { ok: false, error: checked.error };
      }
      folders.push({ entry, name, refusal: addBlocker(checked.check) });
    }
    return { ok: true, scan: { folderBlocker: null, folders } };
  }

  // Judged again from scratch, folder by folder: the scan the browser saw
  // proves nothing, and one refusal never stops the rest.
  async execute(input: ImportSkillsInput): Promise<ImportSkillsResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () => this.land(input));
    return run.ok ? run.value : { ok: false, error: "import-in-progress" };
  }

  private async land(input: ImportSkillsInput): Promise<ImportSkillsResult> {
    const listing = await this.list(input.source);
    if (listing === null) {
      return { ok: false, error: "not-configured" };
    }
    const outcomes: SkillFolder[] = [];
    for (const entry of input.entries) {
      const name = proposeSkillSlug(entry);
      if (!listing.ok) {
        outcomes.push({ entry, name, refusal: listing.blocker });
        continue;
      }
      if (!listing.entries.includes(entry)) {
        outcomes.push({ entry, name, refusal: "not-found" });
        continue;
      }
      const landed = await this.deps.importSkill.add({
        source: join(listing.folder, entry),
        name,
      });
      outcomes.push({ entry, name, refusal: landed.ok ? null : landed.error });
    }
    return { ok: true, outcomes };
  }

  // Null where no Harness is connected. Hidden entries, such as `.git`, are
  // never skills.
  private async list(source: string): Promise<Listing | null> {
    const checked = await this.deps.importSkill.check({ source });
    if (!checked.ok) {
      return null;
    }
    const blocker = checked.check.sourceBlocker;
    if (blocker !== null && FOLDER_BLOCKERS.has(blocker)) {
      return { ok: false, blocker };
    }
    let folder: string;
    try {
      folder = await this.deps.fs.realpath(source);
    } catch {
      return { ok: false, blocker: "source-unreadable" };
    }
    const entries: string[] = [];
    for (const entry of await this.deps.fs.listRawEntries(folder)) {
      if (entry.name.startsWith(".")) continue;
      if (
        entry.isDirectory ||
        (entry.isSymlink &&
          (await this.deps.fs.isDirectory(join(folder, entry.name))))
      ) {
        entries.push(entry.name);
      }
    }
    entries.sort();
    return { ok: true, folder, entries };
  }
}
