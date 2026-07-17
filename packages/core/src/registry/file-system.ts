// The filesystem boundary for the registry domain. Pure logic depends on this
// port, never on node:fs directly, so tests can drive an in-memory fake and the
// Node adapter stays the single place that touches the real disk (ports &
// adapters, see .claude/rules/architecture.md).

export interface FileSystemPort {
  // Resolves a path to its canonical absolute form. Rejects if it does not
  // exist (mirrors node:fs realpath).
  realpath(path: string): Promise<string>;

  // True when the path exists and is a directory.
  isDirectory(path: string): Promise<boolean>;

  // True when the path exists, regardless of whether it is a file or a
  // directory (e.g. a git worktree's ".git" is a file, not a directory).
  exists(path: string): Promise<boolean>;

  // Reads a UTF-8 file, or null when the file does not exist. Other read
  // failures reject.
  readFile(path: string): Promise<string | null>;

  // Lists the names of the child *directories* directly inside a directory;
  // files and unresolved symlinks are excluded (the browse capability relies on
  // this — ADR-0009). Empty when the directory does not exist — a missing
  // skills/ folder is "no skills", not an error.
  listDirectoryNames(path: string): Promise<string[]>;

  // Writes a UTF-8 file atomically (temp file + rename), creating parent
  // directories as needed.
  writeFile(path: string, contents: string): Promise<void>;

  // Creates a directory and any missing parents. A no-op when it already
  // exists (mirrors mkdir recursive).
  ensureDir(path: string): Promise<void>;
}
