// Facts from a single dirent read, never following a trailing symlink.
export type RawDirEntry = {
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
};

export interface FileSystemPort {
  // Rejects when the path does not exist.
  realpath(path: string): Promise<string>;

  isDirectory(path: string): Promise<boolean>;

  // A directory-shaped symlink reports false: the TOCTOU re-check before
  // probing inside a directory observed earlier.
  isDirectoryEntry(path: string): Promise<boolean>;

  // Never follows a trailing symlink, so its target is never disclosed.
  exists(path: string): Promise<boolean>;

  // A symlink reports false without its target being resolved (#148).
  isFileEntry(path: string): Promise<boolean>;

  // Null when the file does not exist; other read failures reject.
  readFile(path: string): Promise<string | null>;

  // Unfiltered. Empty when the directory does not exist.
  listRawEntries(path: string): Promise<RawDirEntry[]>;

  // Atomic (temp file + rename), creating parent directories as needed.
  writeFile(path: string, contents: string): Promise<void>;

  // Exclusive create: false when the path already exists, never a replace.
  createNewFile(path: string, contents: string): Promise<boolean>;

  // Recursive; a missing path is not an error.
  remove(path: string): Promise<void>;

  ensureDir(path: string): Promise<void>;
}
