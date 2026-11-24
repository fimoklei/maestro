import { basename, isAbsolute, join, resolve } from "node:path";
import type { ToolRoots } from "../deploy/deploy-tools";
import { parseGitOrigin } from "../deploy/git-origin";
import { isValidSkillSlug } from "../deploy/package-ref";
import {
  attributeRootPackageFiles,
  isRootPackage,
  skillPrefixes,
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
import { readFrontmatter } from "./frontmatter";
import { ensureHarnessPrimitiveDir } from "./harness-primitive-dir";
import type { ImportMode } from "./import-mode";
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
  | "origin-unproven"
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description"
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

export type ImportCheck = {
  mode: ImportMode;
  // In update mode, the recorded skill's name, never the caller's.
  name: string;
  sourceBlocker: ImportSourceBlocker | null;
  nameBlocker: ImportNameBlocker | null;
  advisories: ManifestAdvisory[];
  category: string | null;
};

export type ImportCheckResult =
  | { ok: true; check: ImportCheck }
  | { ok: false; error: "not-configured" };

export type ImportSkillResult =
  | { ok: true; mode: ImportMode; name: string; skipped: number }
  | { ok: false; error: ImportSkillError };

export type ImportSkillInput = { source: string; name?: string };

export type DeployedTarget = {
  treeRoot: string;
  lockfilePath: string;
  roots: ToolRoots;
};

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

const MANIFEST_ONLY = new Set(["SKILL.md"]);

export class ImportSkill {
  private readonly tree: SameTreeFs;
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: ImportFs;
    facts: Pick<CopyTreeFsPort, "describe">;
    homeRoot: () => string;
    copy: { copy(input: CopyRequest): Promise<CopySkillFolderResult> };
    git: Pick<HarnessGitPort, "readFacts" | "readMovementTrees">;
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

  async check(input: ImportSkillInput): Promise<ImportCheckResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return { ok: true, check: (await this.inspect(root, input)).check };
  }

  async execute(input: ImportSkillInput): Promise<ImportSkillResult> {
    return await this.land(input, "single");
  }

  async add(input: ImportSkillInput): Promise<ImportSkillResult> {
    return await this.land(input, "add");
  }

  async replace(input: ImportSkillInput): Promise<ImportSkillResult> {
    return await this.land(input, "replace");
  }

  async judgeReplace(input: ImportSkillInput): Promise<
    | {
        ok: true;
        verdict: {
          name: string;
          replaces: boolean;
          refusal: ImportSkillError | null;
          category: string | null;
        };
      }
    | { ok: false; error: "not-configured" }
  > {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const { check, source } = await this.inspect(root, input);
    return {
      ok: true,
      verdict: {
        name: check.name,
        replaces: replacesHeld(check),
        refusal: await this.blocker(root, check, source, "replace"),
        category: check.category,
      },
    };
  }

  private async land(
    input: ImportSkillInput,
    policy: LandPolicy,
  ): Promise<ImportSkillResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const { check, source } = await this.inspect(root, input);
    const blocker = await this.blocker(root, check, source, policy);
    if (blocker !== null) {
      return { ok: false, error: blocker };
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
      // A single import replaces only where provenance proved it is the
      // harness's own skill (#732).
      replaceExisting:
        policy === "replace" ? replacesHeld(check) : check.mode === "update",
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

  private async blocker(
    root: string,
    check: ImportCheck,
    source: string | null,
    policy: LandPolicy,
  ): Promise<ImportSkillError | null> {
    if (policy === "add") {
      return addBlocker(check);
    }
    if (check.sourceBlocker !== null) {
      return check.sourceBlocker;
    }
    if (policy === "replace" && check.nameBlocker === "name-taken") {
      return source === null
        ? "source-unreadable"
        : await this.judgeUpdate(root, source, check.name);
    }
    return check.nameBlocker;
  }

  private async skillsDir(root: string): Promise<string | null> {
    const resolved = await ensureHarnessPrimitiveDir(
      this.deps.fs,
      root,
      "skill",
    );
    return resolved.ok ? resolved.dir : null;
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
      nameBlocker:
        provenance.kind === "own" ? null : await this.judgeName(root, name),
      advisories: raw === null ? [] : manifestAdvisories(raw),
      category:
        raw === null ? null : (readFrontmatter(raw)?.fields.category ?? null),
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
    // Before the manifest: a foreign or unproven deployed copy is refused whatever it holds.
    if (provenance.kind === "foreign") {
      return "deployed-copy";
    }
    if (provenance.kind === "unproven") {
      return "origin-unproven";
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

  private async judgeHarnessCopy(
    root: string,
    name: string,
  ): Promise<ImportSourceBlocker | null> {
    const trees = await this.deps.git.readMovementTrees(root).catch(() => null);
    if (trees === null) {
      return "harness-unreadable";
    }
    const working = trees.skill.working[name];
    return working !== undefined && working === trees.skill.local[name]
      ? null
      : "harness-copy-uncommitted";
  }

  private async readProvenance(
    root: string,
    source: string,
  ): Promise<Provenance> {
    for (const target of await this.deps.deployedTargets()) {
      for (const entry of await this.readEntries(target.lockfilePath)) {
        for (const file of entry.deployed_files ?? []) {
          if (!withinTarget(file, target.roots)) {
            continue;
          }
          const real = await this.deps.fs
            .realpath(resolve(target.treeRoot, file))
            .catch(() => null);
          if (real !== source) {
            continue;
          }
          if (entry.host === undefined || entry.repo_url === undefined) {
            return { kind: "unproven" };
          }
          const name = await this.ownSkillName(root, entry, file, target.roots);
          return name === null ? { kind: "foreign" } : { kind: "own", name };
        }
      }
    }
    return { kind: "none" };
  }

  private async ownSkillName(
    root: string,
    entry: LockfileEntry,
    file: string,
    roots: ToolRoots,
  ): Promise<string | null> {
    const name = recordedSkillName(entry, file, roots);
    if (name === null || !isValidSkillSlug(name)) {
      return null;
    }
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

const addBlocker = (
  check: ImportCheck,
): ImportSourceBlocker | ImportNameBlocker | null =>
  check.mode === "update"
    ? "name-taken"
    : (check.sourceBlocker ?? check.nameBlocker);

type LandPolicy = "single" | "add" | "replace";

const replacesHeld = (check: ImportCheck): boolean =>
  check.mode === "update" || check.nameBlocker === "name-taken";

type CopyRequest = Pick<
  CopySkillFolderInput,
  "source" | "destinationParent" | "name" | "replaceExisting" | "finalize"
>;

function withinTarget(file: string, roots: ToolRoots): boolean {
  return (
    !isAbsolute(file) ||
    Object.values(roots).some(
      (root) => isAbsolute(root) && file.startsWith(`${root}/`),
    )
  );
}

function recordedSkillName(
  entry: LockfileEntry,
  file: string,
  roots: ToolRoots,
): string | null {
  if (!isRootPackage(entry)) {
    return claudeSkillName(entry);
  }
  const skill = attributeRootPackageFiles(entry, skillPrefixes(roots)).find(
    (candidate) => `${candidate.prefix}/skills/${candidate.name}` === file,
  );
  return skill?.name ?? null;
}

type Provenance =
  | { kind: "none" }
  | { kind: "foreign" }
  | { kind: "unproven" }
  | { kind: "own"; name: string };
