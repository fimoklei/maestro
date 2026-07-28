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
  // The version travels with the ref it was taken from, so whatever reports the
  // removal can never name a tag the removal did not aim at (#383).
  | { ok: true; ref: string; version: string }
  | {
      ok: false;
      reason: "not-deployed" | "ref-unresolvable" | "lockfile-malformed";
    };

// The only host a deployed skill can have come from (ADR-0014). An entry naming
// any other host was not written by a deploy of ours, so no removal is aimed at
// it.
const SUPPORTED_HOST = "github.com";

// A plain owner/repo — two path segments of the characters GitHub allows, and
// nothing else. Keeps a traversal or an extra segment out of the ref.
const OWNER_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// Every deploy pins a vX.Y.Z tag (ADR-0003), so a branch name or bare commit in
// this field did not come from us.
const VERSION_TAG = /^v\d+\.\d+\.\d+$/;

// The ref for one deployed skill, from already-parsed lockfile entries. The
// identity rule is the lockfile module's (`claudeSkillName`), so this cannot
// disagree with the deploy-state view about which entry is which skill.
//
// Every field is then checked against the shape a deploy of ours writes. The
// lockfile is a file in the user's repo and it alone decides which package apm
// removes: without these checks, anything that can write there could give a row
// labelled "tdd" a ref pointing at a different installed package, and the user
// would confirm removing one thing while apm removed another. Args-array
// execution stops shell injection; only this stops that substitution.
export function refForDeployedSkill(
  entries: readonly LockfileEntry[],
  name: string,
): DeployedRefLookup {
  const matches = entries.filter(
    (candidate) => claudeSkillName(candidate) === name,
  );
  if (matches.length === 0) {
    return { ok: false, reason: "not-deployed" };
  }
  // Two entries claiming one skill is ambiguous, and picking either would
  // remove a package the user never chose between.
  if (matches.length > 1) {
    return { ok: false, reason: "ref-unresolvable" };
  }

  const entry = matches[0] as LockfileEntry;
  const trustworthy =
    entry.host === SUPPORTED_HOST &&
    entry.repo_url !== undefined &&
    OWNER_REPO.test(entry.repo_url) &&
    // The row names one skill; the ref must name that same skill. basename()
    // alone would accept `vendor/other/tdd` for a row reading "tdd".
    entry.virtual_path === `skills/${name}` &&
    VERSION_TAG.test(entry.resolved_ref);
  if (!trustworthy) {
    return { ok: false, reason: "ref-unresolvable" };
  }

  return {
    ok: true,
    ref: `${entry.host}/${entry.repo_url}/${entry.virtual_path}#${entry.resolved_ref}`,
    version: entry.resolved_ref,
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
