// The outside-world ports a deploy reads and writes through.
import type { OutdatedResult } from "../drift/parse-outdated";
import type { LockfileReading, PackageReading } from "../lockfile/lockfile";
import type { SupportedTool } from "./deploy-tools";

// Only the repo arm carries a client-supplied path; the global location is
// resolved server-side.
export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

// "auth-required" is apm's two fixed phrases only; "timed-out" is a hung apm
// the driver stopped; every other apm or git error is "failed".
export type ResolveLatestTagResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "no-tag" | "auth-required" | "timed-out" | "failed" };

// "failed" stays unclassified: a refusal apm did not name is never dressed up
// as a diagnosed one (#180).
export type DeploySkillDriverResult =
  | { ok: true }
  | { ok: false; reason: "destination-symlinked" | "timed-out" | "failed" };

// Only a timeout has a reason: every uninstall outcome exits 0 and the only
// signal is the positive marker.
export type RemoveSkillDriverResult =
  | { ok: true }
  | { ok: false; reason?: "timed-out" };

export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult>;
  // `tools` scopes apm's `-t`: present on the global path, absent on the repo
  // path, where the driver targets every DEPLOY_TOOLS tool (#131).
  deploySkill(input: {
    target: DeployTarget;
    ref: string;
    // The whole desired Selection, never a subset: the `--skill` flag unions
    // with the list apm persisted, so a name left out stays installed.
    skills?: readonly string[];
    tools?: readonly SupportedTool[];
  }): Promise<DeploySkillDriverResult>;
  // `ref` must be the tag-pinned one the install used: a bare name is rejected
  // and still exits 0.
  removeSkill(input: {
    target: DeployTarget;
    ref: string;
  }): Promise<RemoveSkillDriverResult>;
  // Version pairs, never raw apm output.
  checkOutdated(target: DeployTarget): Promise<OutdatedResult>;
};

// The git questions apm cannot answer, asked of the local inventory clone.
export type InventoryGitPort = {
  skillExistsAtTag(tag: string, name: string): Promise<boolean>;
  // Tree-diff, never apm's opaque content_hash.
  skillDivergesFromTag(tag: string, name: string): Promise<boolean>;
  // sha256 per path, relative to the skill directory. Null where nothing could
  // be read, which keeps the copy protected (#952).
  readSkillFilesAtTag(
    tag: string,
    name: string,
  ): Promise<Record<string, string> | null>;
};

// The three unhappy states stay apart from "not-deployed", so a guard refuses
// instead of reading an unchecked copy as an empty one (#58, #59).
export type DeployedContentState =
  | "not-deployed"
  | "clean"
  | "diverged"
  | "unverifiable"
  | "unreadable"
  | "lockfile-malformed";

export type DeployedContentPort = {
  // Never rejects: a present but unreadable lockfile reads as malformed (#58).
  readLockfile(target: DeployTarget): Promise<LockfileReading>;
  // `tools` scopes the scan and its baseline, so an untargeted tool's absent
  // copy cannot force a false `diverged` (#136).
  classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    // A copy equal to this release in full is `clean`; an unreadable release
    // grants no such pass (#952).
    release?: string;
    // Read once per target and shared by every skill classified against it.
    lockfile: LockfileReading;
  }): Promise<DeployedContentState>;
  // Consent is given for content, not a verdict: two different edits both
  // read `diverged`. Null where nothing could be read.
  contentDigest(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null>;
  // The symlinked leaf skill directory apm refuses to write into, or null.
  // Computed from disk, never from apm's prose (#748).
  linkedSkillPath(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null>;
};

// Anything short of an entry we read is "unverified", never success: apm's own
// marker is what this read exists to distrust (#358).
export type RecordedPackageResult =
  | { kind: "recorded"; reading: PackageReading }
  | { kind: "unverified" };

export type RecordedPackagePort = {
  read(input: {
    lockfile: LockfileReading;
    name: string;
  }): Promise<RecordedPackageResult>;
};

// A subtree-scoped removal, never `apm uninstall -g`, which deletes beyond its
// lockfile. Idempotent (#136).
export type DeployedCleanupPort = {
  removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void>;
};
