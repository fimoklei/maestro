// Writes one prompt file into the Working Harness: no branch, commit or push.
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

// The refusal for a prompt file that is a link, or that cannot be read.
const entryRefusal = (
  kind: "unsafe" | "unreadable",
): "destination-unsafe" | "destination-unreadable" =>
  kind === "unsafe" ? "destination-unsafe" : "destination-unreadable";

export type ImportPromptError =
  | "not-configured"
  | PromptFieldProblem
  // The prompts folder resolves outside the Harness, or the file is a link.
  | "destination-unsafe"
  | "destination-unreadable"
  | "import-in-progress"
  | "write-failed";

// What the import route answers on success.
export type ImportPromptSuccess = { mode: ImportMode; name: string };

export type ImportPromptResult =
  | ({ ok: true } & ImportPromptSuccess)
  | { ok: false; error: ImportPromptError };

// Taken only while `<name>.md` is in the Working Harness: a name deleted
// there is free again.
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

/** Why one file of a batch was not written; the rest still run. */
export type PromptImportRefusal =
  | PromptFieldProblem
  // A batch never replaces: the Harness, or an earlier file, holds the name.
  | "prompt-taken"
  | "destination-unsafe"
  | "destination-unreadable"
  | "write-failed";

/** One file of a batch, in the order it was sent. */
export type PromptImportOutcome = { name: string } & (
  | { imported: true }
  | { imported: false; refusal: PromptImportRefusal }
);

/** Refuses the whole batch before any file is written. */
export type ImportPromptsError =
  | "not-configured"
  | "destination-unsafe"
  | "destination-unreadable"
  | "import-in-progress";

/** What the batch import route answers on success. */
export type ImportPromptsAnswer = { outcomes: PromptImportOutcome[] };

export type ImportPromptsResult =
  | ({ ok: true } & ImportPromptsAnswer)
  | { ok: false; error: ImportPromptsError };

/** The edited fields, and the prompt as `read` gave it when the dialog opened. */
export type PromptEdit = PromptFile & { name: string; read: PromptFile };

export type EditPromptError =
  | ReadPromptError
  | PromptFieldProblem
  // The file no longer reads as the `read` the dialog was filled with.
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
    // A missing or unsafe folder holds no prompt; the import states why.
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

  /** The prompt as the Working Harness holds it, never the Released harness. */
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

  // Rewrites only a file that is there: an edit never creates a prompt.
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

  // The other front matter keys come from the file as it reads under the lock.
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

  // A taken name is no blocker: the write replaces that prompt.
  async execute(input: PromptDraft): Promise<ImportPromptResult> {
    // Judged again: never trust the fields the browser checked.
    const [problem] = promptDraftProblems(input);
    if (problem !== undefined) {
      return { ok: false, error: problem };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () => this.write(root, input));
    return run.ok ? run.value : { ok: false, error: "import-in-progress" };
  }

  /**
   * Each file is judged by the single import's field rules, in field order,
   * and refused where the name is taken. One refusal never stops the rest.
   */
  async importMany(
    drafts: readonly PromptDraft[],
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
    drafts: readonly PromptDraft[],
  ): Promise<ImportPromptsResult> {
    const folder = await this.ensureFolder(root);
    if (folder !== null) {
      return { ok: false, error: folder };
    }
    const outcomes: PromptImportOutcome[] = [];
    // In order: an earlier file's write takes its name from a later one.
    for (const draft of drafts) {
      const [problem] = promptDraftProblems(draft);
      const written =
        problem === undefined
          ? await this.writeNew(root, draft)
          : ({ ok: false, error: problem } as const);
      outcomes.push(
        written.ok
          ? { name: draft.name, imported: true }
          : { name: draft.name, imported: false, refusal: written.error },
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

  // A link is refused before it is written: the write never follows it.
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

  // A batch never replaces: the Harness, or an earlier file, holds the name.
  private async writeNew(
    root: string,
    draft: PromptDraft,
  ): Promise<{ ok: true } | { ok: false; error: PromptImportRefusal }> {
    const entry = await this.entry(root, draft.name);
    if (!entry.ok) return entry;
    if (entry.taken) return { ok: false, error: "prompt-taken" };
    return (await this.writeAt(entry.path, draft))
      ? { ok: true }
      : { ok: false, error: "write-failed" };
  }

  private async write(
    root: string,
    draft: PromptDraft,
  ): Promise<ImportPromptResult> {
    const folder = await this.ensureFolder(root);
    if (folder !== null) {
      return { ok: false, error: folder };
    }
    const entry = await this.entry(root, draft.name);
    if (!entry.ok) return entry;
    if (!(await this.writeAt(entry.path, draft))) {
      return { ok: false, error: "write-failed" };
    }
    const mode: ImportMode = entry.taken ? "update" : "add";
    return { ok: true, mode, name: draft.name };
  }

  // A link is refused before it is read: the read never follows it.
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
