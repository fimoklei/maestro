import type { ToolRoots } from "../deploy/deploy-tools";
import { classifyPackageType, type LockfileEntry } from "../lockfile/lockfile";

export type RootPackageSkill = {
  name: string;
  prefix: string;
  files: string[];
};

export const skillPrefixes = (roots: ToolRoots): string[] =>
  Object.values(roots);

export function isRootPackage(entry: LockfileEntry): boolean {
  return classifyPackageType(entry.package_type) === "package";
}

export function attributeRootPackageFiles(
  entry: LockfileEntry,
  prefixes: readonly string[],
): RootPackageSkill[] {
  const byKey = new Map<string, RootPackageSkill>();
  for (const prefix of prefixes) {
    for (const file of entry.deployed_files ?? []) {
      const name = skillNameUnder(file, prefix);
      if (name === null) {
        continue;
      }
      const key = `${prefix}/${name}`;
      const skill = byKey.get(key) ?? { name, prefix, files: [] };
      skill.files.push(file);
      byKey.set(key, skill);
    }
  }
  return [...byKey.values()];
}

export async function deployedRootPackageSkills(
  entry: LockfileEntry,
  prefixes: readonly string[],
  fileExists: (path: string) => Promise<boolean>,
): Promise<RootPackageSkill[]> {
  const attributed = attributeRootPackageFiles(entry, prefixes);
  const present = await Promise.all(
    attributed.map(async (skill) => {
      const probes = await Promise.all(skill.files.map(fileExists));
      return probes.some(Boolean);
    }),
  );
  return attributed.filter((_skill, index) => present[index] === true);
}

export function countExtraRootPackageFiles(
  entry: LockfileEntry,
  prefixes: readonly string[],
): number {
  return (entry.deployed_files ?? []).filter((file) =>
    prefixes.some(
      (prefix) =>
        file.startsWith(`${prefix}/`) &&
        !file.startsWith(`${prefix}/skills/`) &&
        file !== `${prefix}/skills`,
    ),
  ).length;
}

function skillNameUnder(file: string, prefix: string): string | null {
  const head = `${prefix}/skills/`;
  if (!file.startsWith(head)) {
    return null;
  }
  const [name = "", ...rest] = file.slice(head.length).split("/");
  return name.length > 0 && rest.length > 0 ? name : null;
}
