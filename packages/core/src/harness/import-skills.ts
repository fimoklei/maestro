// Imports one chosen skill folder, or the skill folders directly inside it,
// each through ImportSkill's own judgement and copy: no branch, commit or push.
import { basename, dirname, join, resolve } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { FileSystemPort } from "../registry/file-system";
import type {
  ImportSkill,
  ImportSkillError,
  ImportSourceBlocker,
} from "./import-skill";
import { proposeSkillSlug } from "./skill-slug";

/**
 * What one folder inside the chosen one did on import: its directory entry,
 * its skill name, why it did not land, and whether it replaced a held skill.
 */
export type SkillFolderOutcome = {
  entry: string;
  name: string;
  refusal: ImportSkillError | null;
  replaces: boolean;
};

/** One folder as the scan judges it, with its SKILL.md `metadata.category`. */
export type SkillFolder = SkillFolderOutcome & { category: string | null };

// A folder to import; only `replace` lets it take the place of a held skill.
type SkillFolderPick = { entry: string; replace: boolean };

/**
 * What the chosen folder holds; `folderBlocker` refuses the folder itself and
 * lists nothing. `folder` is the folder the entries sit in, to import from:
 * the chosen one, or the one around it where the chosen folder is a skill.
 */
export type SkillFolderScan = {
  folderBlocker: SkillsFolderBlocker | null;
  folder: string | null;
  folders: SkillFolder[];
};

// The chosen folder answers to the single import's source rules only; it
// need not be a skill itself.
const FOLDER_BLOCKERS = [
  "source-unreadable",
  "outside-root",
  "deployed-copy",
  "origin-unproven",
] as const satisfies readonly ImportSourceBlocker[];

/** Why the chosen folder itself cannot be read for skills. */
export type SkillsFolderBlocker = (typeof FOLDER_BLOCKERS)[number];

export type ImportSkillsInput = {
  source: string;
  entries: readonly SkillFolderPick[];
};

export type ImportSkillsError = "not-configured" | "import-in-progress";

export type ScanSkillFoldersResult =
  | { ok: true; scan: SkillFolderScan }
  | { ok: false; error: "not-configured" };

export type ImportSkillsResult =
  | { ok: true; outcomes: SkillFolderOutcome[] }
  | { ok: false; error: ImportSkillsError };

const isFolderBlocker = (
  blocker: ImportSourceBlocker,
): blocker is SkillsFolderBlocker =>
  FOLDER_BLOCKERS.some((folderBlocker) => folderBlocker === blocker);

type Listing =
  | { ok: true; folder: string; entries: string[] }
  | { ok: false; blocker: SkillsFolderBlocker };

export class ImportSkills {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: Pick<
      FileSystemPort,
      "realpath" | "isDirectory" | "exists" | "listRawEntries"
    >;
    importSkill: Pick<
      ImportSkill,
      "check" | "judgeReplace" | "add" | "replace"
    >;
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
    const listing = await this.listForScan(source);
    if (listing === null) {
      return { ok: false, error: "not-configured" };
    }
    if (!listing.ok) {
      return {
        ok: true,
        scan: { folderBlocker: listing.blocker, folder: null, folders: [] },
      };
    }
    const folders: SkillFolder[] = [];
    for (const entry of listing.entries) {
      const judged = await this.deps.importSkill.judgeReplace({
        source: join(listing.folder, entry),
        name: proposeSkillSlug(entry),
      });
      if (!judged.ok) {
        return { ok: false, error: judged.error };
      }
      folders.push({ entry, ...judged.verdict });
    }
    return {
      ok: true,
      scan: { folderBlocker: null, folder: listing.folder, folders },
    };
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
    const listing = await this.listForImport(input.source);
    if (listing === null) {
      return { ok: false, error: "not-configured" };
    }
    const outcomes: SkillFolderOutcome[] = [];
    // A skill this batch landed is never replaced by a later folder.
    const landedNames = new Set<string>();
    for (const { entry, replace } of input.entries) {
      const name = proposeSkillSlug(entry);
      if (!listing.ok) {
        outcomes.push({
          entry,
          name,
          refusal: listing.blocker,
          replaces: false,
        });
        continue;
      }
      if (!listing.entries.includes(entry)) {
        outcomes.push({ entry, name, refusal: "not-found", replaces: false });
        continue;
      }
      const folder = { source: join(listing.folder, entry), name };
      const judged = replace
        ? await this.deps.importSkill.judgeReplace(folder)
        : null;
      const replaces =
        judged?.ok === true &&
        judged.verdict.replaces &&
        !landedNames.has(judged.verdict.name);
      const landed = replaces
        ? await this.deps.importSkill.replace(folder)
        : await this.deps.importSkill.add(folder);
      if (landed.ok) {
        landedNames.add(landed.name);
      }
      outcomes.push(
        landed.ok
          ? { entry, name: landed.name, refusal: null, replaces }
          : { entry, name, refusal: landed.error, replaces },
      );
    }
    return { ok: true, outcomes };
  }

  // A folder with its own SKILL.md is one skill, whatever its subfolders
  // hold. It is listed under its own name inside the folder around it, so
  // a link keeps the name it was chosen by. Hidden entries, such as `.git`,
  // are left out of a listing of several.
  private async listForScan(source: string): Promise<Listing | null> {
    const opened = await this.open(source);
    if (opened === null || !opened.ok) {
      return opened;
    }
    if (!(await this.deps.fs.exists(join(opened.folder, "SKILL.md")))) {
      const entries = await this.subfolders(opened.folder);
      return {
        ...opened,
        entries: entries.filter((entry) => !entry.startsWith(".")),
      };
    }
    const chosen = resolve(source);
    try {
      const folder = await this.deps.fs.realpath(dirname(chosen));
      return { ok: true, folder, entries: [basename(chosen)] };
    } catch {
      return { ok: false, blocker: "source-unreadable" };
    }
  }

  // An import names any folder directly inside the source, the ones a scan
  // lists included; ImportSkill judges each one.
  private async listForImport(source: string): Promise<Listing | null> {
    const opened = await this.open(source);
    if (opened === null || !opened.ok) {
      return opened;
    }
    return { ...opened, entries: await this.subfolders(opened.folder) };
  }

  // Null where no Harness is connected.
  private async open(
    source: string,
  ): Promise<
    | { ok: true; folder: string }
    | { ok: false; blocker: SkillsFolderBlocker }
    | null
  > {
    const checked = await this.deps.importSkill.check({ source });
    if (!checked.ok) {
      return null;
    }
    const blocker = checked.check.sourceBlocker;
    if (blocker !== null && isFolderBlocker(blocker)) {
      return { ok: false, blocker };
    }
    try {
      return { ok: true, folder: await this.deps.fs.realpath(source) };
    } catch {
      return { ok: false, blocker: "source-unreadable" };
    }
  }

  private async subfolders(folder: string): Promise<string[]> {
    const entries: string[] = [];
    for (const entry of await this.deps.fs.listRawEntries(folder)) {
      if (
        entry.isDirectory ||
        (entry.isSymlink &&
          (await this.deps.fs.isDirectory(join(folder, entry.name))))
      ) {
        entries.push(entry.name);
      }
    }
    return entries.sort();
  }
}
