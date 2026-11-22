import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { FileSystemPort } from "../registry/file-system";
import {
  ensureHarnessPrimitiveDir,
  inspectPrimitiveEntry,
  type PrimitiveEntryFs,
} from "./harness-primitive-dir";
import type { ImportMode } from "./import-mode";
import {
  draftPrompt,
  type PromptDraft,
  type PromptFieldProblem,
  type PromptFile,
  promptDraftProblems,
  promptFieldProblems,
  promptFileTooLong,
  promptNameProblem,
  samePrompt,
  writePromptFile,
} from "./prompt-file";

const entryRefusal = (
  kind: "unsafe" | "unreadable",
): "destination-unsafe" | "destination-unreadable" =>
  kind === "unsafe" ? "destination-unsafe" : "destination-unreadable";

export type ImportPromptCheck = {
  mode: ImportMode;
  nameBlocker: "empty-name" | "invalid-name" | null;
};

export type ImportPromptCheckResult =
  | { ok: true; check: ImportPromptCheck }
  | { ok: false; error: "not-configured" };

export type ReadPromptError =
  | "not-configured"
  | "invalid-name"
  | "prompt-missing"
  | "destination-unsafe"
  | "destination-unreadable";

export type ReadPromptResult =
  | { ok: true; prompt: PromptFile }
  | { ok: false; error: ReadPromptError };

export type PromptImportDraft = PromptDraft & { replace: boolean };

export type PromptImportRefusal =
  | PromptFieldProblem
  | "prompt-taken"
  | "destination-unsafe"
  | "destination-unreadable"
  | "write-failed";

export type PromptImportOutcome = { name: string } & (
  | { imported: true; mode: ImportMode }
  | { imported: false; refusal: PromptImportRefusal }
);

export type ImportPromptsError =
  | "not-configured"
  | "destination-unsafe"
  | "destination-unreadable"
  | "import-in-progress";

export type ImportPromptsAnswer = { outcomes: PromptImportOutcome[] };

export type ImportPromptsResult =
  | ({ ok: true } & ImportPromptsAnswer)
  | { ok: false; error: ImportPromptsError };

export type PromptEdit = PromptFile & { name: string; read: PromptFile };

export type EditPromptError =
  | ReadPromptError
  | PromptFieldProblem
  | "prompt-changed"
  | "import-in-progress"
  | "write-failed";

export type EditPromptResult =
  | { ok: true; name: string }
  | { ok: false; error: EditPromptError };

export class ImportPrompt {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: PrimitiveEntryFs &
      Pick<FileSystemPort, "ensureDir" | "readFile" | "writeFile">;
    locks: InFlightLocks;
  };

  constructor(deps: ImportPrompt["deps"]) {
    this.deps = deps;
  }

  async check(name: string): Promise<ImportPromptCheckResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const nameBlocker = promptNameProblem(name);
    if (nameBlocker !== null) {
      return { ok: true, check: { mode: "add", nameBlocker } };
    }
    const entry = await inspectPrimitiveEntry(this.deps.fs, root, {
      type: "prompt",
      name,
    });
    const taken = entry.kind === "plain" || entry.kind === "unsafe";
    return {
      ok: true,
      check: { mode: taken ? "update" : "add", nameBlocker: null },
    };
  }

  async read(name: string): Promise<ReadPromptResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    if (promptNameProblem(name) !== null) {
      return { ok: false, error: "invalid-name" };
    }
    const found = await this.load(root, name);
    if (!found.ok) {
      return found;
    }
    return { ok: true, prompt: found.prompt };
  }

  async edit(input: PromptEdit): Promise<EditPromptResult> {
    const [problem] = promptFieldProblems(input);
    if (problem !== undefined) {
      return { ok: false, error: problem };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.rewrite(root, input),
    );
    return run.ok ? run.value : { ok: false, error: "import-in-progress" };
  }

  private async rewrite(
    root: string,
    { name, read, ...edited }: PromptEdit,
  ): Promise<EditPromptResult> {
    const found = await this.load(root, name);
    if (!found.ok) {
      return found;
    }
    if (!samePrompt(found.prompt, read)) {
      return { ok: false, error: "prompt-changed" };
    }
    const write = { frontmatter: found.frontmatter, ...edited };
    if (promptFileTooLong(write)) {
      return { ok: false, error: "long-text" };
    }
    try {
      await this.deps.fs.writeFile(found.path, writePromptFile(write));
    } catch {
      return { ok: false, error: "write-failed" };
    }
    return { ok: true, name };
  }

  async importMany(
    drafts: readonly PromptImportDraft[],
  ): Promise<ImportPromptsResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.writeMany(root, drafts),
    );
    return run.ok ? run.value : { ok: false, error: "import-in-progress" };
  }

  private async writeMany(
    root: string,
    drafts: readonly PromptImportDraft[],
  ): Promise<ImportPromptsResult> {
    const judged = drafts.map(({ replace, ...draft }) => ({
      draft,
      replace,
      problem: promptDraftProblems(draft)[0],
    }));
    if (judged.some(({ problem }) => problem === undefined)) {
      const folder = await this.ensureFolder(root);
      if (folder !== null) {
        return { ok: false, error: folder };
      }
    }
    const outcomes: PromptImportOutcome[] = [];
    const written = new Set<string>();
    for (const { draft, replace, problem } of judged) {
      const landed =
        problem === undefined
          ? await this.writeOne(
              root,
              draft,
              replace && !written.has(draft.name),
            )
          : ({ ok: false, error: problem } as const);
      if (landed.ok) written.add(draft.name);
      outcomes.push(
        landed.ok
          ? { name: draft.name, imported: true, mode: landed.mode }
          : { name: draft.name, imported: false, refusal: landed.error },
      );
    }
    return { ok: true, outcomes };
  }

  private async ensureFolder(
    root: string,
  ): Promise<"destination-unsafe" | "destination-unreadable" | null> {
    const resolved = await ensureHarnessPrimitiveDir(
      this.deps.fs,
      root,
      "prompt",
    );
    if (resolved.ok) return null;
    return resolved.reason === "outside-root"
      ? "destination-unsafe"
      : "destination-unreadable";
  }

  private async entry(root: string, name: string) {
    const entry = await inspectPrimitiveEntry(this.deps.fs, root, {
      type: "prompt",
      name,
    });
    return entry.kind === "unsafe" || entry.kind === "unreadable"
      ? ({ ok: false, error: entryRefusal(entry.kind) } as const)
      : ({
          ok: true,
          path: entry.path,
          taken: entry.kind === "plain",
        } as const);
  }

  private async writeAt(
    path: string,
    { name: _, ...file }: PromptDraft,
  ): Promise<boolean> {
    try {
      await this.deps.fs.writeFile(path, writePromptFile(file));
      return true;
    } catch {
      return false;
    }
  }

  private async writeOne(
    root: string,
    draft: PromptDraft,
    replace: boolean,
  ): Promise<
    { ok: true; mode: ImportMode } | { ok: false; error: PromptImportRefusal }
  > {
    const entry = await this.entry(root, draft.name);
    if (!entry.ok) return entry;
    if (entry.taken && !replace) return { ok: false, error: "prompt-taken" };
    return (await this.writeAt(entry.path, draft))
      ? { ok: true, mode: entry.taken ? "update" : "add" }
      : { ok: false, error: "write-failed" };
  }

  private async load(
    root: string,
    name: string,
  ): Promise<
    | { ok: true; path: string; frontmatter: string; prompt: PromptFile }
    | {
        ok: false;
        error:
          | "prompt-missing"
          | "destination-unsafe"
          | "destination-unreadable";
      }
  > {
    const entry = await inspectPrimitiveEntry(this.deps.fs, root, {
      type: "prompt",
      name,
    });
    if (entry.kind === "unsafe" || entry.kind === "unreadable") {
      return { ok: false, error: entryRefusal(entry.kind) };
    }
    let raw: string | null = null;
    if (entry.kind === "plain") {
      try {
        raw = await this.deps.fs.readFile(entry.path);
      } catch {
        return { ok: false, error: "destination-unreadable" };
      }
    }
    if (raw === null) {
      return { ok: false, error: "prompt-missing" };
    }
    const { name: _, frontmatter, ...prompt } = draftPrompt(raw, null);
    return { ok: true, path: entry.path, frontmatter, prompt };
  }
}
