// The filesystem boundary for the registry domain (architecture.md).

// Facts from a single dirent read, never following a trailing symlink.
export type RawDirEntry = {
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
};

export interface FileSystemPort {
  // Rejects when the path does not exist (mirrors node:fs realpath).
  realpath(path: string): Promise<string>;

  isDirectory(path: string): Promise<boolean>;

  // Unlike isDirectory, a directory-shaped symlink reports false. This is the
  // TOCTOU re-check a caller runs before probing anything relative to a
  // directory it observed earlier (ADR-0009).
  isDirectoryEntry(path: string): Promise<boolean>;

  // Never follows a trailing symlink: a git worktree's ".git" is a file, and a
  // symlinked ".git" counts without its target being resolved or disclosed.
  exists(path: string): Promise<boolean>;

  // A regular file and nothing else — a symlink reports false without its
  // target being resolved, matching what browse reads off a dirent (#148).
  isFileEntry(path: string): Promise<boolean>;

  // Null when the file does not exist; other read failures reject.
  readFile(path: string): Promise<string | null>;

  // Unfiltered — callers decide which entry types they want, so browse can find
  // symlinked directories and validate each one itself (#148). Empty when the
  // directory does not exist: a missing .apm/skills/ is "no skills", not an error.
  listRawEntries(path: string): Promise<RawDirEntry[]>;

  // Atomic (temp file + rename), creating parent directories as needed.
  writeFile(path: string, contents: string): Promise<void>;

  // Exclusive create: false when the path already exists, and never a
  // replacement of what is there. This is what a caller that checked for
  // collisions earlier uses, so a path that appeared since is refused rather
  // than clobbered.
  createNewFile(path: string, contents: string): Promise<boolean>;

  // Recursive, and a missing path is not an error — this is the rollback of a
  // partial write, which cannot know how far it got.
  remove(path: string): Promise<void>;

  ensureDir(path: string): Promise<void>;
}
