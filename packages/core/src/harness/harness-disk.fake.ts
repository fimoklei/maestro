import { join } from "node:path";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { HARNESS_PRIMITIVE_TYPES, primitiveDir } from "./harness-primitive";

const HARNESS_ROOT = "/harness";

export const harnessDisk = (
  seed: {
    entries?: string[];
    links?: Record<string, string>;
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
