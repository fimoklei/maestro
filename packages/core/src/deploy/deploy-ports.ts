import type { OutdatedResult } from "../drift/parse-outdated";
import type { LockfileReading, PackageReading } from "../lockfile/lockfile";
import type { SupportedTool } from "./deploy-tools";

export type DeployTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global" };

export type ResolveLatestTagResult =
  | { ok: true; tag: string }
  | { ok: false; reason: "no-tag" | "auth-required" | "timed-out" | "failed" };

export type DeploySkillDriverResult =
  | { ok: true }
  | { ok: false; reason: "destination-symlinked" | "timed-out" | "failed" };

export type RemoveSkillDriverResult =
  | { ok: true }
  | { ok: false; reason?: "timed-out" };

export type ApmDriverPort = {
  resolveLatestTag(ownerRepo: string): Promise<ResolveLatestTagResult>;
  deploySkill(input: {
    target: DeployTarget;
    ref: string;
    skills?: readonly string[];
    tools?: readonly SupportedTool[];
  }): Promise<DeploySkillDriverResult>;
  removeSkill(input: {
    target: DeployTarget;
    ref: string;
  }): Promise<RemoveSkillDriverResult>;
  checkOutdated(target: DeployTarget): Promise<OutdatedResult>;
};

export type InventoryGitPort = {
  skillExistsAtTag(tag: string, name: string): Promise<boolean>;
  skillDivergesFromTag(tag: string, name: string): Promise<boolean>;
  readSkillFilesAtTag(
    tag: string,
    name: string,
  ): Promise<Record<string, string> | null>;
};

export type DeployedContentState =
  | "not-deployed"
  | "clean"
  | "diverged"
  | "unverifiable"
  | "unreadable"
  | "lockfile-malformed";

export type DeployedContentPort = {
  readLockfile(target: DeployTarget): Promise<LockfileReading>;
  classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    deployRoot?: string;
    release?: string;
    lockfile: LockfileReading;
  }): Promise<DeployedContentState>;
  contentDigest(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    deployRoot?: string;
  }): Promise<string | null>;
  linkedSkillPath(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    deployRoot?: string;
  }): Promise<string | null>;
};

export type RecordedPackageResult =
  | { kind: "recorded"; reading: PackageReading }
  | { kind: "unverified" };

export type RecordedPackagePort = {
  read(input: {
    lockfile: LockfileReading;
    name: string;
  }): Promise<RecordedPackageResult>;
};

export type DeployedCleanupPort = {
  removeSkillTargets(input: {
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }): Promise<void>;
};
