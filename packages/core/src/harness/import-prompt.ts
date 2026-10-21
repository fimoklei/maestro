// Writes one prompt file into the Working Harness: no branch, commit or push.
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { FileSystemPort } from "../registry/file-system";
import { primitiveEntry } from "./harness-primitive";
import {
  ensureHarnessPrimitiveDir,
  resolveHarnessPrimitiveDir,
} from "./harness-primitive-dir";
import type { ImportMode } from "./import-mode";
import {
  type PromptDraft,
  type PromptFieldProblem,
  promptFieldProblems,
  promptNameProblem,
  writePromptFile,
} from "./prompt-file";

export type ImportPromptError =
  | "not-configured"
  | PromptFieldProblem
  // The prompts folder resolves outside the Harness.
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

export class ImportPrompt {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: Pick<FileSystemPort, "realpath" | "exists" | "ensureDir" | "writeFile">;
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
    const resolved = await resolveHarnessPrimitiveDir(
      this.deps.fs,
      root,
      "prompt",
    );
    const taken =
      resolved.ok &&
      (await this.deps.fs.exists(
        join(resolved.dir, primitiveEntry({ type: "prompt", name })),
      ));
    return {
      ok: true,
      check: { mode: taken ? "update" : "add", nameBlocker: null },
    };
  }

  // A taken name is no blocker: the write replaces that prompt.
  async execute(input: PromptDraft): Promise<ImportPromptResult> {
    // Judged again: never trust the fields the browser checked.
    const [problem] = promptFieldProblems(input);
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

  private async write(
    root: string,
    { name, description, text }: PromptDraft,
  ): Promise<ImportPromptResult> {
    const resolved = await ensureHarnessPrimitiveDir(
      this.deps.fs,
      root,
      "prompt",
    );
    if (!resolved.ok) {
      return {
        ok: false,
        error:
          resolved.reason === "outside-root"
            ? "destination-unsafe"
            : "destination-unreadable",
      };
    }
    const path = join(resolved.dir, primitiveEntry({ type: "prompt", name }));
    const mode: ImportMode = (await this.deps.fs.exists(path))
      ? "update"
      : "add";
    try {
      // Atomic: a symlinked file is replaced, never written through.
      await this.deps.fs.writeFile(
        path,
        writePromptFile({ description, text }),
      );
    } catch {
      return { ok: false, error: "write-failed" };
    }
    return { ok: true, mode, name };
  }
}
