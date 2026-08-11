// Copying one external skill folder into the connected Working harness, and
// nothing after it: no branch, no commit, no push. What lands shows up as a
// pending promotion, the same route as any other edit (#576).
import { basename, join } from "node:path";
import { DEPLOY_TOOLS } from "../deploy/deploy-tools";
import { isValidSkillSlug } from "../deploy/package-ref";
import { isWithinRoot } from "../filesystem/browse-path";
import type {
  CopySkillFolderError,
  CopySkillFolderInput,
  CopySkillFolderResult,
} from "../filesystem/copy-skill-folder";
import { HARNESS_SKILLS_DIR } from "../inventory/harness-layout";
import type { FileSystemPort } from "../registry/file-system";
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
  | "empty-description";

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

export type ImportCheck = {
  // The proposal when the caller named none, echoed back either way.
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
  | { ok: true; name: string; skipped: number }
  | { ok: false; error: ImportSkillError };

export type ImportSkillInput = { source: string; name?: string };

type ImportFs = Pick<
  FileSystemPort,
  "realpath" | "isDirectory" | "exists" | "readFile" | "writeFile" | "ensureDir"
>;

export class ImportSkill {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: ImportFs;
    // The same ceiling the picker browses under: an import takes a path from
    // the browser, so it is allowlisted like every other one (security.md).
    homeRoot: () => string;
    copy: { copy(input: CopyRequest): Promise<CopySkillFolderResult> };
    // Every root a deploy can have written into: the home for global installs
    // and each registered repository (ADR-0011).
    deployedRoots: () => Promise<string[]>;
  };

  constructor(deps: ImportSkill["deps"]) {
    this.deps = deps;
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
      // Inside the staging tree, so a manifest that cannot be made to agree
      // with the directory name refuses the whole import (#576).
      finalize: (payload) => this.stampName(payload, check.name),
    });
    if (!copied.ok) {
      return { ok: false, error: copied.error };
    }

    return { ok: true, name: check.name, skipped: copied.skipped };
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
    const name =
      input.name ?? proposeSkillSlug(source === null ? "" : basename(source));
    const check: ImportCheck = {
      name,
      sourceBlocker: await this.judgeSource(source, raw),
      nameBlocker: await this.judgeName(root, name),
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
    source: string | null,
    raw: string | null,
  ): Promise<ImportSourceBlocker | null> {
    if (source === null) {
      return "source-unreadable";
    }
    if (!(await this.withinHome(source))) {
      return "outside-root";
    }
    // Before the manifest is judged: a deployed copy is refused for what it is,
    // whatever it happens to contain. The roots are canonicalized against the
    // canonical source, or a symlinked prefix (/var -> /private/var) would let
    // one through.
    const roots = await this.canonicalRoots();
    if (isDeployedCopy(source, roots)) {
      return "deployed-copy";
    }
    return validateSkillStructure(raw);
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

  // A root that cannot be resolved is kept as it was written: it names a place
  // that is not there, which can hold no copy either way.
  private async canonicalRoots(): Promise<string[]> {
    const roots = await this.deps.deployedRoots();
    return Promise.all(
      roots.map((root) => this.deps.fs.realpath(root).catch(() => root)),
    );
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
  "source" | "destinationParent" | "name" | "finalize"
>;

// True where the folder sits in or under any tool's deployed skills directory,
// under the home or a registered repository. Importing one back would copy a
// deploy's output into the harness it was deployed from.
function isDeployedCopy(source: string, roots: readonly string[]): boolean {
  return roots.some((root) =>
    DEPLOY_TOOLS.some((tool) =>
      isWithinRoot(source, join(root, tool.skillsDirPrefix, "skills")),
    ),
  );
}
