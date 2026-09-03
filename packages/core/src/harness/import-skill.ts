// Copying one external skill folder into the connected Working harness, and
// nothing after it: no branch, no commit, no push. What lands shows up as a
// pending promotion, the same route as any other edit (#576).
import { basename, join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import { isValidSkillSlug } from "../deploy/package-ref";
import { isWithinRoot } from "../filesystem/browse-path";
import type {
  CopySkillFolderError,
  CopySkillFolderInput,
  CopySkillFolderResult,
} from "../filesystem/copy-skill-folder";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import { type SameTreeFs, sameTree } from "../filesystem/same-tree";
import { HARNESS_SKILLS_DIR } from "../inventory/harness-layout";
import {
  claudeSkillName,
  type LockfileEntry,
  parseLockfile,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { HarnessGitPort } from "./read-harness-state";
import {
  type ManifestAdvisory,
  manifestAdvisories,
  rewriteFrontmatterName,
} from "./skill-manifest";
import { proposeSkillSlug } from "./skill-slug";
import { validateSkillStructure } from "./validate-skill-structure";

// What the source folder itself is refused for.
export type ImportSourceBlocker =
  | "source-unreadable"
  | "outside-root"
  | "deployed-copy"
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description"
  // Only in update mode: the harness's own copy of that skill differs from the
  // commit it sits on, and replacing it would destroy work git cannot give back.
  | "harness-copy-uncommitted"
  // Only in update mode: the clone's committed state could not be read at all,
  // so the guard above could not be run. Its own code because its own way out.
  | "harness-unreadable"
  // Only in update mode: the copy holds what the harness holds already, so the
  // replacement would leave no pending proposal and nothing to review.
  | "nothing-to-carry-back";

// What the chosen destination name is refused for. Kept apart from the source
// blockers so the cockpit can state a clash on the name field itself.
export type ImportNameBlocker = "invalid-name" | "name-taken";

export type ImportSkillError =
  | "not-configured"
  // The harness's own skills directory does not resolve inside the harness —
  // a symlinked `.apm` would place the copy somewhere else entirely.
  | "destination-unsafe"
  | ImportSourceBlocker
  | ImportNameBlocker
  | CopySkillFolderError;

// Adding a skill the harness does not hold, or replacing one it does with an
// edited copy of its own deployed output (#732).
export type ImportMode = "add" | "update";

export type ImportCheck = {
  mode: ImportMode;
  // The proposal when the caller named none, echoed back either way. In update
  // mode it is the recorded skill's own name: provenance decides it, not the
  // caller.
  name: string;
  sourceBlocker: ImportSourceBlocker | null;
  nameBlocker: ImportNameBlocker | null;
  advisories: ManifestAdvisory[];
};

export type ImportCheckResult =
  | { ok: true; check: ImportCheck }
  | { ok: false; error: "not-configured" };

export type ImportSkillResult =
  // `skipped` is what the copy left behind: the `.git` entries, counted at
  // every depth, so the author is told what did not come along.
  | { ok: true; mode: ImportMode; name: string; skipped: number }
  | { ok: false; error: ImportSkillError };

export type ImportSkillInput = { source: string; name?: string };

// One place apm could have deployed into: its lockfile is the provenance
// record, and its tree root is what deployed_files entries are relative to
// (#667). Global splits the two — apm writes the lockfile under ~/.apm but
// keys paths HOME-relative (DeployedLocation).
export type DeployedTarget = { treeRoot: string; lockfilePath: string };

type ImportFs = Pick<
  FileSystemPort,
  | "realpath"
  | "isDirectory"
  | "exists"
  | "readFile"
  | "writeFile"
  | "ensureDir"
  | "listRawEntries"
>;

// The manifest is compared apart, name stamped in. `.git` is skipped by
// `sameTree` itself, under the copy port's own policy.
const MANIFEST_ONLY = new Set(["SKILL.md"]);

export class ImportSkill {
  private readonly tree: SameTreeFs;
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: ImportFs;
    // Mode bits, which FileSystemPort does not carry: an executable bit is a
    // change git records, so a comparison blind to it would refuse a real one.
    facts: Pick<CopyTreeFsPort, "describe">;
    // The same ceiling the picker browses under: an import takes a path from
    // the browser, so it is allowlisted like every other one (security.md).
    homeRoot: () => string;
    copy: { copy(input: CopyRequest): Promise<CopySkillFolderResult> };
    // The harness's own git: where it was cloned from, which is what a
    // deployment record's origin is proved against, and whether its copy of a
    // skill still matches the commit it sits on.
    git: Pick<HarnessGitPort, "readFacts" | "readMovementTrees">;
    // Every lockfile a deploy can have written: the global install and each
    // registered repository (ADR-0011).
    deployedTargets: () => Promise<DeployedTarget[]>;
  };

  constructor(deps: ImportSkill["deps"]) {
    this.deps = deps;
    this.tree = {
      listRawEntries: (path) => deps.fs.listRawEntries(path),
      readFile: (path) => deps.fs.readFile(path),
      describe: (path) => deps.facts.describe(path),
    };
  }

  // Judges the source and the name without writing anything, so the cockpit can
  // refuse at the button and say why beside the field that owns the refusal.
  async check(input: ImportSkillInput): Promise<ImportCheckResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return { ok: true, check: (await this.inspect(root, input)).check };
  }

  async execute(input: ImportSkillInput): Promise<ImportSkillResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    // Judged again here, never trusting the check the browser saw: the source
    // and the harness both move between the two calls (security.md).
    const { check, source } = await this.inspect(root, input);
    if (check.sourceBlocker !== null) {
      return { ok: false, error: check.sourceBlocker };
    }
    if (check.nameBlocker !== null) {
      return { ok: false, error: check.nameBlocker };
    }
    if (source === null) {
      return { ok: false, error: "source-unreadable" };
    }

    const destinationParent = await this.skillsDir(root);
    if (destinationParent === null) {
      return { ok: false, error: "destination-unsafe" };
    }
    const copied = await this.deps.copy.copy({
      // The canonical source the checks were made against, never the path the
      // browser sent: a link retargeted since would otherwise pick the tree.
      source,
      destinationParent,
      name: check.name,
      // Opted into only where provenance proved this is the harness's own
      // skill coming home; adding never writes over anything (#732).
      replaceExisting: check.mode === "update",
      // Inside the staging tree, so a manifest that cannot be made to agree
      // with the directory name refuses the whole import (#576).
      finalize: (payload) => this.stampName(payload, check.name),
    });
    if (!copied.ok) {
      return { ok: false, error: copied.error };
    }

    return {
      ok: true,
      mode: check.mode,
      name: check.name,
      skipped: copied.skipped,
    };
  }

  // The harness's skills directory, created and then proved to resolve inside
  // the harness itself. Null where it does not: a symlinked `.apm` is a
  // destination outside the fixed root (security.md).
  private async skillsDir(root: string): Promise<string | null> {
    const lexical = join(root, HARNESS_SKILLS_DIR);
    try {
      await this.deps.fs.ensureDir(lexical);
      const real = await this.deps.fs.realpath(lexical);
      const realRoot = await this.deps.fs.realpath(root);
      return isWithinRoot(real, realRoot) ? real : null;
    } catch {
      return null;
    }
  }

  private async inspect(
    root: string,
    input: ImportSkillInput,
  ): Promise<{ check: ImportCheck; source: string | null }> {
    const source = await this.realSource(input.source);
    const raw =
      source === null
        ? null
        : await this.readManifest(join(source, "SKILL.md"));
    const within = source !== null && (await this.withinHome(source));
    // Only a folder inside the ceiling is worth asking the record about: an
    // unreachable one is refused for that before anything else is read.
    const provenance: Provenance =
      source === null || !within
        ? { kind: "none" }
        : await this.readProvenance(root, source);
    const name =
      provenance.kind === "own"
        ? provenance.name
        : (input.name ??
          proposeSkillSlug(source === null ? "" : basename(source)));
    const check: ImportCheck = {
      mode: provenance.kind === "own" ? "update" : "add",
      name,
      sourceBlocker: await this.judgeSource(root, {
        source,
        within,
        raw,
        provenance,
      }),
      // A taken name is what update mode requires, so only adding refuses one.
      nameBlocker:
        provenance.kind === "own" ? null : await this.judgeName(root, name),
      advisories: raw === null ? [] : manifestAdvisories(raw),
    };
    return { check, source };
  }

  // Canonical, so the deployed-copy rule compares what the author picked with
  // where a deploy writes, not two spellings of one path.
  private async realSource(source: string): Promise<string | null> {
    let real: string;
    try {
      real = await this.deps.fs.realpath(source);
    } catch {
      return null;
    }
    return (await this.deps.fs.isDirectory(real)) ? real : null;
  }

  private async readManifest(path: string): Promise<string | null> {
    try {
      return await this.deps.fs.readFile(path);
    } catch {
      return null;
    }
  }

  private async judgeSource(
    root: string,
    what: {
      source: string | null;
      within: boolean;
      raw: string | null;
      provenance: Provenance;
    },
  ): Promise<ImportSourceBlocker | null> {
    const { source, within, raw, provenance } = what;
    if (source === null) {
      return "source-unreadable";
    }
    if (!within) {
      return "outside-root";
    }
    // Before the manifest is judged: a deployed copy this harness cannot claim
    // is refused for what it is, whatever it happens to contain.
    if (provenance.kind === "foreign") {
      return "deployed-copy";
    }
    const structure = validateSkillStructure(raw);
    if (structure !== null) {
      return structure;
    }
    return provenance.kind === "own"
      ? await this.judgeUpdate(root, source, provenance.name)
      : null;
  }

  // What refuses a replacement: work the harness holds that git cannot give
  // back, and a copy that would change nothing. The data-loss guard runs first.
  private async judgeUpdate(
    root: string,
    source: string,
    name: string,
  ): Promise<ImportSourceBlocker | null> {
    const unsafe = await this.judgeHarnessCopy(root, name);
    if (unsafe !== null) {
      return unsafe;
    }
    return (await this.carriesNoChange(root, source, name))
      ? "nothing-to-carry-back"
      : null;
  }

  // True where the replacement would write back exactly what is there: git
  // would see no change, so no pending proposal would appear (#733). Anything
  // unreadable counts as a difference, and the review is where it is read.
  private async carriesNoChange(
    root: string,
    source: string,
    name: string,
  ): Promise<boolean> {
    const held = join(root, HARNESS_SKILLS_DIR, name);
    // The manifest is compared as the copy would write it, name stamped in:
    // an edit to the name alone is stamped back out, and is no change at all.
    const raw = await this.readManifest(join(source, "SKILL.md"));
    const stamped = raw === null ? null : rewriteFrontmatterName(raw, name);
    if (
      stamped === null ||
      stamped !== (await this.readManifest(join(held, "SKILL.md")))
    ) {
      return false;
    }
    return await sameTree(this.tree, source, held, MANIFEST_ONLY);
  }

  // The guard on the write; an uncheckable guard fails closed. see ADR-0026
  private async judgeHarnessCopy(
    root: string,
    name: string,
  ): Promise<ImportSourceBlocker | null> {
    const trees = await this.deps.git.readMovementTrees(root).catch(() => null);
    if (trees === null) {
      return "harness-unreadable";
    }
    const working = trees.working[name];
    return working !== undefined && working === trees.local[name]
      ? null
      : "harness-copy-uncommitted";
  }

  // What some lockfile records about this folder — provenance, never a guess
  // from where the folder sits (#667). see ADR-0026
  private async readProvenance(
    root: string,
    source: string,
  ): Promise<Provenance> {
    for (const target of await this.deps.deployedTargets()) {
      for (const entry of await this.readEntries(target.lockfilePath)) {
        for (const file of entry.deployed_files ?? []) {
          const real = await this.deps.fs
            .realpath(join(target.treeRoot, file))
            .catch(() => null);
          if (real !== source) {
            continue;
          }
          const name = await this.ownSkillName(root, entry);
          return name === null ? { kind: "foreign" } : { kind: "own", name };
        }
      }
    }
    return { kind: "none" };
  }

  // The skill this harness would be updating, or null where the entry cannot
  // prove both origin and name. see ADR-0026
  private async ownSkillName(
    root: string,
    entry: LockfileEntry,
  ): Promise<string | null> {
    const name = claudeSkillName(entry);
    if (name === null || !isValidSkillSlug(name)) {
      return null;
    }
    if (entry.host === undefined || entry.repo_url === undefined) {
      return null;
    }
    // Parsed on both sides, so two spellings of one remote are one origin
    // (ADR-0014). `repo_url` is owner/repo, with the host beside it.
    const facts = await this.deps.git.readFacts(root).catch(() => null);
    const origin =
      facts == null || facts.originUrl === null
        ? null
        : parseGitOrigin(facts.originUrl);
    if (
      origin === null ||
      origin.host !== entry.host ||
      origin.ownerRepo !== entry.repo_url
    ) {
      return null;
    }
    return (await this.deps.fs.exists(join(root, HARNESS_SKILLS_DIR, name)))
      ? name
      : null;
  }

  // Every entry in one lockfile. A missing or unparseable lockfile records no
  // deploys — it blocks nothing, it never widens the refusal, and it never
  // opens the update route either.
  private async readEntries(lockfilePath: string): Promise<LockfileEntry[]> {
    const raw = await this.deps.fs.readFile(lockfilePath).catch(() => null);
    if (raw === null) {
      return [];
    }
    const parsed = parseLockfile(raw);
    return parsed.ok ? parsed.entries : [];
  }

  // Canonical on both sides, so a symlinked home (/var -> /private/var) is the
  // same ceiling the browse route answers for.
  private async withinHome(source: string): Promise<boolean> {
    try {
      return isWithinRoot(
        source,
        await this.deps.fs.realpath(this.deps.homeRoot()),
      );
    } catch {
      return false;
    }
  }

  private async judgeName(
    root: string,
    name: string,
  ): Promise<ImportNameBlocker | null> {
    if (!isValidSkillSlug(name)) {
      return "invalid-name";
    }
    return (await this.deps.fs.exists(join(root, HARNESS_SKILLS_DIR, name)))
      ? "name-taken"
      : null;
  }

  // The directory name is the skill's identity, so the staged manifest is made
  // to agree with it. False refuses the import: a copy whose manifest names a
  // different skill is not the thing the author asked to import.
  private async stampName(payload: string, name: string): Promise<boolean> {
    const manifest = join(payload, "SKILL.md");
    const raw = await this.readManifest(manifest);
    if (raw === null) {
      return false;
    }
    const stamped = rewriteFrontmatterName(raw, name);
    if (stamped === null) {
      return false;
    }
    if (stamped === raw) {
      return true;
    }
    try {
      await this.deps.fs.writeFile(manifest, stamped);
      return true;
    } catch {
      return false;
    }
  }
}

// The copy's own input shape, minus the fields this use-case never sends.
type CopyRequest = Pick<
  CopySkillFolderInput,
  "source" | "destinationParent" | "name" | "replaceExisting" | "finalize"
>;

// What the deployment records say about the picked folder: nothing at all, an
// entry this harness cannot claim, or one that proves the folder is a copy of
// the named skill this harness itself deployed.
type Provenance =
  | { kind: "none" }
  | { kind: "foreign" }
  | { kind: "own"; name: string };
