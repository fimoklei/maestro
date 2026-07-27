// Which package reference names a deployed skill. A remove must hand apm the
// same ref the install used — a bare skill name is rejected outright and still
// exits 0 (apm-driver.md § Remove) — and the only record of that ref is the
// target's own lockfile entry. Reading it there, rather than rebuilding it from
// whatever the inventory points at today, keeps the remove aimed at what is
// actually installed.
import {
  claudeSkillName,
  type LockfileEntry,
  parseLockfile,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { DeployTarget } from "./deploy-skill";
import type { DeployedLocation } from "./deployed-location";

// "not-deployed": no entry for this skill — the cockpit's row is stale, and
// there is nothing for apm to remove. "ref-unresolvable": an entry exists but
// names no origin, so the ref cannot be rebuilt; refuse rather than guess a ref
// that would silently match nothing. "lockfile-malformed": the file is present
// but does not parse, so nothing about it can be trusted (#58).
export type DeployedRefLookup =
  | { ok: true; ref: string }
  | {
      ok: false;
      reason: "not-deployed" | "ref-unresolvable" | "lockfile-malformed";
    };

// The ref for one deployed skill, from already-parsed lockfile entries. The
// identity rule is the lockfile module's (`claudeSkillName`), so this cannot
// disagree with the deploy-state view about which entry is which skill.
export function refForDeployedSkill(
  entries: readonly LockfileEntry[],
  name: string,
): DeployedRefLookup {
  const entry = entries.find(
    (candidate) => claudeSkillName(candidate) === name,
  );
  if (entry === undefined) {
    return { ok: false, reason: "not-deployed" };
  }
  if (entry.host === undefined || entry.repo_url === undefined) {
    return { ok: false, reason: "ref-unresolvable" };
  }
  // virtual_path, not a rebuilt "skills/<name>": the entry's own path is what
  // apm matched at install time.
  return {
    ok: true,
    ref: `${entry.host}/${entry.repo_url}/${entry.virtual_path}#${entry.resolved_ref}`,
  };
}

// Adapter: reads the target's apm.lock.yaml through the filesystem port. An
// absent lockfile is "nothing deployed", never an error — apm deletes the file
// rather than emptying it when the last dependency goes (apm-behavior.md).
export class DeployedRefAdapter {
  private readonly fs: FileSystemPort;
  private readonly location: DeployedLocation;

  constructor(deps: { fs: FileSystemPort; location: DeployedLocation }) {
    this.fs = deps.fs;
    this.location = deps.location;
  }

  async resolve(input: {
    target: DeployTarget;
    name: string;
  }): Promise<DeployedRefLookup> {
    const raw = await this.fs.readFile(
      this.location.lockfilePath(input.target),
    );
    if (raw === null) {
      return { ok: false, reason: "not-deployed" };
    }
    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, reason: "lockfile-malformed" };
    }
    return refForDeployedSkill(parsed.entries, input.name);
  }
}
