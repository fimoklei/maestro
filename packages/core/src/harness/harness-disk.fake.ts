import { join } from "node:path";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { HARNESS_PRIMITIVE_TYPES, primitiveDir } from "./harness-primitive";

export const HARNESS_ROOT = "/harness";

/** A Harness clone's disk: its root and type folders, plus the entries named. */
export const harnessDisk = (
  seed: {
    // A path ending in `.md` is a prompt file, any other a folder.
    entries?: string[];
    // Link path → target. A type folder may be one too.
    links?: Record<string, string>;
    // Type folders left off the disk.
    missing?: string[];
    unreadable?: string[];
    unremovable?: string[];
  } = {},
): InMemoryFileSystem => {
  const isFile = (path: string) => path.endsWith(".md");
  const links = Object.entries(seed.links ?? {});
  const folders = [
    HARNESS_ROOT,
    ...HARNESS_PRIMITIVE_TYPES.map((type) =>
      join(HARNESS_ROOT, primitiveDir(type)),
    ),
  ].filter((path) => !seed.missing?.includes(path) && !seed.links?.[path]);
  return new InMemoryFileSystem({
    directories: Object.fromEntries([
      ...folders.map((path) => [path, path]),
      ...(seed.entries ?? [])
        .filter((path) => !isFile(path))
        .map((path) => [path, path]),
      ...links.filter(([path]) => !isFile(path)),
    ]),
    files: Object.fromEntries(
      (seed.entries ?? []).filter(isFile).map((path) => [path, ""]),
    ),
    fileSymlinks: Object.fromEntries(links.filter(([path]) => isFile(path))),
    unreadable: seed.unreadable,
    unremovable: seed.unremovable,
  });
};
