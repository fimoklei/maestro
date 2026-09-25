// Copies one external skill folder into the Working harness: no branch, commit or push.
import { basename, join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import { isValidSkillSlug } from "../deploy/package-ref";
import {
  attributeRootPackageFiles,
  DEPLOY_SKILL_PREFIXES,
  isRootPackage,
} from "../deploy-state/root-package-skills";
import type {
  CopySkillFolderError,
  CopySkillFolderInput,
  CopySkillFolderResult,
} from "../filesystem/copy-skill-folder";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import { isWithinRoot } from "../filesystem/path-containment";
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

export type ImportSourceBlocker =
  | "source-unreadable"
  | "outside-root"
  | "deployed-copy"
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description"
  // Update mode only: replacing would destroy uncommitted work in the harness copy.
  | "harness-copy-uncommitted"
  | "harness-unreadable"
  | "nothing-to-carry-back";

export type ImportNameBlocker = "invalid-name" | "name-taken";

export type ImportSkillError =
  | "not-configured"
  | "destination-unsafe"
  | ImportSourceBlocker
  | ImportNameBlocker
  | CopySkillFolderError;

// Add a new skill, or replace one with an edited copy of its own deployed output (#732).
export type ImportMode = "add" | "update";

export type ImportCheck = {
  mode: ImportMode;
  // In update mode, the recorded skill's name, never the caller's.
  name: string;
  sourceBlocker: ImportSourceBlocker | null;
  nameBlocker: ImportNameBlocker | null;
  advisories: ManifestAdvisory[];
};

export type ImportCheckResult =
  | { ok: true; check: ImportCheck }
  | { ok: false; error: "not-configured" };

export type ImportSkillResult =
  // `skipped` counts the `.git` entries left out, at every depth.
  | { ok: true; mode: ImportMode; name: string; skipped: number }
  | { ok: false; error: ImportSkillError };

export type ImportSkillInput = { source: string; name?: string };

// `deployed_files` are relative to `treeRoot`, which for global installs is
// HOME, not the lockfile's folder (#667).
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

// The manifest is compared apart, with the name stamped in.
const MANIFEST_ONLY = new Set(["SKILL.md"]);

export class ImportSkill {
  private readonly tree: SameTreeFs;
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: ImportFs;
    // Mode bits: git records an executable bit, so the comparison must see it.
    facts: Pick<CopyTreeFsPort, "describe">;
    // The source path comes from the browser: keep it inside this ceiling.
    homeRoot: () => string;
    copy: { copy(input: CopyRequest): Promise<CopySkillFolderResult> };
    git: Pick<HarnessGitPort, "readFacts" | "readMovementTrees">;
    // The global install and each registered repository.
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

  // Judges the source and the name without writing anything.
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
    // Judged again: never trust the check the browser saw.
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
      // The checked canonical path, never the browser's: a link may have moved.
      source,
      destinationParent,
      name: check.name,
      // Only where provenance proved it is the harness's own skill (#732).
      replaceExisting: check.mode === "update",
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

  // Null where a symlinked `.apm` resolves outside the harness.
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
    // Only a folder inside the ceiling is read for provenance.
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
      // Update mode requires a taken name.
      nameBlocker:
        provenance.kind === "own" ? null : await this.judgeName(root, name),
      advisories: raw === null ? [] : manifestAdvisories(raw),
    };
    return { check, source };
  }

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
    // Before the manifest: a foreign deployed copy is refused whatever it holds.
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

  // The data-loss guard runs first.
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

  // Anything unreadable counts as a difference (#733).
  private async carriesNoChange(
    root: string,
    source: string,
    name: string,
  ): Promise<boolean> {
    const held = join(root, HARNESS_SKILLS_DIR, name);
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

  // An uncheckable guard fails closed.
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

  // From the lockfiles, never guessed from where the folder sits (#667).
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
          const name = await this.ownSkillName(root, entry, file);
          return name === null ? { kind: "foreign" } : { kind: "own", name };
        }
      }
    }
    return { kind: "none" };
  }

  // Null where the entry cannot prove both origin and name.
  private async ownSkillName(
    root: string,
    entry: LockfileEntry,
    file: string,
  ): Promise<string | null> {
    const name = recordedSkillName(entry, file);
    if (name === null || !isValidSkillSlug(name)) {
      return null;
    }
    if (entry.host === undefined || entry.repo_url === undefined) {
      return null;
    }
    // Parsed, so two spellings of one remote match. `repo_url` is owner/repo.
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

  // A missing or unparseable lockfile records no deploys.
  private async readEntries(lockfilePath: string): Promise<LockfileEntry[]> {
    const raw = await this.deps.fs.readFile(lockfilePath).catch(() => null);
    if (raw === null) {
      return [];
    }
    const parsed = parseLockfile(raw);
    return parsed.ok ? parsed.entries : [];
  }

  // Canonical on both sides: a symlinked home is still one ceiling.
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

  // Makes the staged manifest's name match the directory; false refuses the import.
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

type CopyRequest = Pick<
  CopySkillFolderInput,
  "source" | "destinationParent" | "name" | "replaceExisting" | "finalize"
>;

// A Root package names no one skill: only a deployed skill's directory row does.
function recordedSkillName(entry: LockfileEntry, file: string): string | null {
  if (!isRootPackage(entry)) {
    return claudeSkillName(entry);
  }
  const skill = attributeRootPackageFiles(entry, DEPLOY_SKILL_PREFIXES).find(
    (candidate) => `${candidate.prefix}/skills/${candidate.name}` === file,
  );
  return skill?.name ?? null;
}

type Provenance =
  | { kind: "none" }
  | { kind: "foreign" }
  | { kind: "own"; name: string };
