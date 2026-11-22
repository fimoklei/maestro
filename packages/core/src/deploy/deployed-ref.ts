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

const OWNER_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

function refForDeployedSkill(
  entries: readonly LockfileEntry[],
  name: string,
): DeployedRefLookup {
  const matches = entries.filter(
    (candidate) => claudeSkillName(candidate) === name,
  );
  const [entry, ...rivals] = matches;
  if (entry === undefined) {
    return { ok: false, reason: "not-deployed" };
  }
  if (rivals.length > 0) {
    return { ok: false, reason: "ref-unresolvable" };
  }

  const trustworthy =
    entry.host === SUPPORTED_HOST &&
    entry.repo_url !== undefined &&
    OWNER_REPO.test(entry.repo_url) &&
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
    if (unreadableCovers(parsed.unreadable, input.name)) {
      return { ok: false, reason: "lockfile-malformed" };
    }
    return refForDeployedSkill(parsed.entries, input.name);
  }
}
