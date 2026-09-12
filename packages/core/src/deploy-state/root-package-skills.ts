// A Harness dependency is one `apm_package` row that deploys many skills, so
// which skills it deployed is read from its recorded files, never from
// `skill_subset` or `skills:` — both keep names the last narrow dropped
// (docs/research/941-narrowing-spike.md § 2, ADR-0031).
import { DEPLOY_TOOLS } from "../deploy/deploy-tools";
import { classifyPackageType, type LockfileEntry } from "../lockfile/lockfile";

// One skill's recorded files inside one tool's subtree. `files` are lockfile
// paths, relative to the target's tree root, so a caller can probe them.
export type RootPackageSkill = {
  name: string;
  prefix: string;
  files: string[];
};

// Every subtree a deploy can land in, in DEPLOY_TOOLS order.
export const DEPLOY_SKILL_PREFIXES = DEPLOY_TOOLS.map(
  (tool) => tool.skillsDirPrefix,
);

export function isRootPackage(entry: LockfileEntry): boolean {
  return classifyPackageType(entry.package_type) === "package";
}

// Attributes the recorded files by path prefix and skill name. A row naming the
// skill directory itself carries no file under the skill and is dropped: a
// directory can outlive its contents (#941 step 4b).
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

// The recorded skills that are actually there. apm keeps rows for files it
// failed or refused to delete, and such a row is a phantom, never a deployed
// skill (#941 steps 3d and 4b).
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

// What the deploy put in a tool's subtree that belongs to no skill: `includes:
// auto` deploys every primitive type while the Harness stays skills-only, so
// this is a fact to know, never an action to take (ADR-0031 § Accepted limits).
// A file under none of the given prefixes belongs to no target counted here.
export function countExtraRootPackageFiles(
  entry: LockfileEntry,
  prefixes: readonly string[],
): number {
  return (entry.deployed_files ?? []).filter((file) =>
    prefixes.some(
      (prefix) =>
        file.startsWith(`${prefix}/`) &&
        !file.startsWith(`${prefix}/skills/`) &&
        // The skills directory row itself names the selection, not a file
        // beside it.
        file !== `${prefix}/skills`,
    ),
  ).length;
}

// `<prefix>/skills/<name>/<rest>` and nothing else — a path with no `<rest>` is
// the directory row, and one under another prefix belongs to no detected tool.
function skillNameUnder(file: string, prefix: string): string | null {
  const head = `${prefix}/skills/`;
  if (!file.startsWith(head)) {
    return null;
  }
  const [name = "", ...rest] = file.slice(head.length).split("/");
  return name.length > 0 && rest.length > 0 ? name : null;
}
