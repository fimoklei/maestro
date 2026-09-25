import { isAbsolute } from "node:path";
import type { FileSystemPort } from "./file-system";

type NormalizedRepoPath =
  | { ok: true; path: string }
  | { ok: false; error: "missing" | "relative" };

export type RepoPathError =
  | "missing"
  | "relative"
  | "not-found"
  | "not-a-directory";

type ValidatedRepoPath =
  | { ok: true; path: string }
  | { ok: false; error: RepoPathError };

export function normalizeRepoPathInput(input: string): NormalizedRepoPath {
  const path = input.trim();
  if (path === "") {
    return { ok: false, error: "missing" };
  }
  if (!isAbsolute(path)) {
    return { ok: false, error: "relative" };
  }
  return { ok: true, path };
}

export async function validateRepoPath(
  input: string,
  fs: FileSystemPort,
): Promise<ValidatedRepoPath> {
  const normalized = normalizeRepoPathInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  let real: string;
  try {
    real = await fs.realpath(normalized.path);
  } catch {
    return { ok: false, error: "not-found" };
  }

  if (!(await fs.isDirectory(real))) {
    return { ok: false, error: "not-a-directory" };
  }

  return { ok: true, path: real };
}
