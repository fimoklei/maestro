// A remove reuses the ref from the target's own lockfile, never from what the
// inventory points at today.
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import {
  claudeSkillName,
  type LockfileEntry,
  parseLockfile,
  unreadableCovers,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { DeployTarget } from "./deploy-skill";
import type { DeployedLocation } from "./deployed-location";

export type DeployedRefLookup =
  | { ok: true; ref: string; version: string }
  | {
      ok: false;
      reason: "not-deployed" | "ref-unresolvable" | "lockfile-malformed";
    };

const SUPPORTED_HOST = "github.com";

// Two segments and nothing else: keeps a traversal or an extra segment out of
// the ref.
const OWNER_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// The lockfile lives in the user's repo and alone decides which package apm
// removes, so every field is checked against the shape our own deploy writes:
// an args array stops injection, only this stops substitution.
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
  // Picking either would remove a package the user never chose between.
  if (matches.length > 1) {
    return { ok: false, reason: "ref-unresolvable" };
  }

  const entry = matches[0] as LockfileEntry;
  const trustworthy =
    entry.host === SUPPORTED_HOST &&
    entry.repo_url !== undefined &&
    OWNER_REPO.test(entry.repo_url) &&
    // basename() alone would accept `vendor/other/tdd` for a row reading "tdd".
    entry.virtual_path === harnessSkillSubpath(name) &&
    RELEASE_TAG_PATTERN.test(entry.resolved_ref);
  if (!trustworthy) {
    return { ok: false, reason: "ref-unresolvable" };
  }

  return {
    ok: true,
    ref: `${entry.host}/${entry.repo_url}/${entry.virtual_path}#${entry.resolved_ref}`,
    version: entry.resolved_ref,
  };
}

// An absent lockfile is "nothing deployed", never an error: apm deletes the
// file when the last dependency goes.
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
    // An unreadable entry may be this very skill's (#58, #357).
    if (unreadableCovers(parsed.unreadable, input.name)) {
      return { ok: false, reason: "lockfile-malformed" };
    }
    return refForDeployedSkill(parsed.entries, input.name);
  }
}
