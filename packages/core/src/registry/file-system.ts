export type RawDirEntry = {
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
};

export type FileStamp = { modifiedMs: number; size: number };

export const sameStamp = (a: FileStamp, b: FileStamp): boolean =>
  a.modifiedMs === b.modifiedMs && a.size === b.size;

export interface FileSystemPort {
  realpath(path: string): Promise<string>;

  isDirectory(path: string): Promise<boolean>;

  isDirectoryEntry(path: string): Promise<boolean>;

  exists(path: string): Promise<boolean>;

  isFileEntry(path: string): Promise<boolean>;

  readFile(path: string): Promise<string | null>;

  stamp(path: string): Promise<FileStamp | null>;

  listRawEntries(path: string): Promise<RawDirEntry[]>;

  // Atomic (temp file + rename), creating parent directories as needed.
  writeFile(path: string, contents: string): Promise<void>;

  createNewFile(path: string, contents: string): Promise<boolean>;

  remove(path: string): Promise<void>;

  ensureDir(path: string): Promise<void>;
}
