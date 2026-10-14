// The production composition over one in-memory disk, with an apm that moves
// the manifest, the lockfile and the deployed copies the way the real one does.
import { createHash } from "node:crypto";
import type { ApmDriverPort, DeployTarget, SupportedTool } from "@maestro/core";
import type {
  DeploySkillDriverResult,
  ResolveLatestTagResult,
} from "../../packages/core/src/deploy/deploy-skill";
import { deployTargetSubtrees } from "../../packages/core/src/deploy/deploy-tools";
import { DeployedLocation } from "../../packages/core/src/deploy/deployed-location";
import { InMemoryCopyTree } from "../../packages/core/src/filesystem/copy-tree-fs.fake";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { inMemoryApp } from "./in-memory-app";

export const HOME = "/home";
const HARNESS_ROOT = "/harness";
const RELEASE = "v0.5.1";
const HARNESS = "fimoklei/agent-harness";
const ORIGIN_URL = `git@github.com:${HARNESS}.git`;

const skillManifest = (name: string) =>
  `---\nname: ${name}\ndescription: ${name} skill\n---\n`;

const location = new DeployedLocation({ HOME });
const treeRoot = (target: DeployTarget) => location.treeRoot(target);
export const lockfilePath = (target: DeployTarget) =>
  location.lockfilePath(target);
const manifestPath = (target: DeployTarget) => location.manifestPath(target);

// The apm.yml an install writes for a Selection.
export const consumerManifest = (skills: readonly string[]) => `name: consumer
version: 1.0.0
dependencies:
  apm:
    - git: ${HARNESS}
      ref: ${RELEASE}
      skills:
${[...skills]
  .sort()
  .map((skill) => `        - ${skill}`)
  .join("\n")}
  mcp: []
`;

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

type Install = {
  target: DeployTarget;
  ref: string;
  skills: readonly string[];
  tools?: readonly SupportedTool[];
};

// What the faked outside world answers; a test changes them mid-flow.
type Answers = {
  detectedTools: readonly SupportedTool[];
  latestTag: ResolveLatestTagResult;
  // The next install's answer instead of landing; "throw" never returns.
  installRefusal: DeploySkillDriverResult | "throw" | null;
  // What an install places, whatever it was asked for.
  lands: (skills: readonly string[]) => readonly string[];
  installHold: Promise<void> | null;
  // "unproven" is an uninstall with no success marker.
  uninstallAnswer: (target: DeployTarget) => "removed" | "unproven" | "throw";
  // The inventory clone's own answers about the release tag.
  skillAtTag: boolean;
  divergedFromTag: boolean;
  // The release's file hashes by path; null is a clone that cannot answer.
  releasedFiles: Record<string, string> | null;
  // Replaces the install outright, as a driver fed a captured refusal.
  deploySkill: ApmDriverPort["deploySkill"] | null;
};

export function deployWorld(
  options: {
    // Released skills; with none, no Harness is connected at all.
    released?: readonly string[];
    detectedTools?: readonly SupportedTool[];
  } = {},
) {
  const disk = new InMemoryCopyTree();
  const installs: Install[] = [];
  const uninstalls: { target: DeployTarget; ref: string }[] = [];
  const state: Answers = {
    detectedTools: options.detectedTools ?? ["claude", "codex"],
    latestTag: { ok: true, tag: RELEASE },
    installRefusal: null,
    lands: (skills) => skills,
    installHold: null,
    uninstallAnswer: () => "removed",
    skillAtTag: true,
    divergedFromTag: false,
    releasedFiles: null,
    deploySkill: null,
  };

  const copies = (
    skills: readonly string[],
    tools: readonly SupportedTool[] | undefined,
  ) =>
    skills.flatMap((skill) =>
      deployTargetSubtrees(skill, tools).map((dir) => `${dir}/SKILL.md`),
    );

  // A recorded copy goes before the new ones land; an unrecorded one stays.
  const recorded = (target: DeployTarget) =>
    [
      ...(disk.read(lockfilePath(target))?.toString("utf8") ?? "").matchAll(
        /^ {2}- (\S+\/skills\/[^/\s]+)\//gm,
      ),
    ].map((match) => match[1] as string);

  const lockfile = (target: DeployTarget, release: string, files: string[]) => {
    const hashes = files.flatMap((file) => {
      const bytes = disk.read(`${treeRoot(target)}/${file}`);
      return bytes === undefined
        ? []
        : [`    ${file}: sha256:${sha256(bytes)}`];
    });
    return [
      "lockfile_version: '1'",
      "dependencies:",
      `- repo_url: ${HARNESS}`,
      "  name: agent-harness",
      "  host: github.com",
      `  resolved_ref: ${release}`,
      "  package_type: apm_package",
      ...(files.length === 0
        ? []
        : ["  deployed_files:", ...files.map((file) => `  - ${file}`)]),
      ...(hashes.length === 0 ? [] : ["  deployed_file_hashes:", ...hashes]),
      "",
    ].join("\n");
  };

  const apm: ApmDriverPort = {
    resolveLatestTag: async () => state.latestTag,
    deploySkill: async (input) => {
      if (state.deploySkill !== null) {
        return state.deploySkill(input);
      }
      installs.push({
        target: input.target,
        ref: input.ref,
        skills: input.skills ?? [],
        ...(input.tools === undefined ? {} : { tools: input.tools }),
      });
      await state.installHold;
      if (state.installRefusal === "throw") {
        throw new Error("apm install failed: token in stderr");
      }
      if (state.installRefusal !== null) {
        return state.installRefusal;
      }
      const root = treeRoot(input.target);
      for (const dir of recorded(input.target)) {
        disk.remove(`${root}/${dir}`);
      }
      const files = copies(state.lands(input.skills ?? []), input.tools);
      for (const file of files) {
        disk.write(`${root}/${file}`, skillManifest(file.split("/")[2] ?? ""));
      }
      disk.write(
        lockfilePath(input.target),
        lockfile(input.target, input.ref.split("#")[1] ?? "", files),
      );
      disk.write(
        manifestPath(input.target),
        consumerManifest(input.skills ?? []),
      );
      return { ok: true };
    },
    // The per-skill uninstall: takes the named skill's copies off every tool.
    removeSkill: async (input) => {
      uninstalls.push({ target: input.target, ref: input.ref });
      const answer = state.uninstallAnswer(input.target);
      if (answer === "throw") {
        throw new Error("apm uninstall failed: token in stderr");
      }
      if (answer === "unproven") {
        return { ok: false };
      }
      const name = input.ref.match(/\/skills\/([^/#]+)#/)?.[1] ?? "";
      for (const dir of deployTargetSubtrees(name)) {
        disk.remove(`${treeRoot(input.target)}/${dir}`);
      }
      return { ok: true };
    },
    checkOutdated: async () => {
      throw new Error("apm.checkOutdated was reached");
    },
  };

  const harnessGit = new InMemoryHarnessGit();
  harnessGit.root = HARNESS_ROOT;
  const released = options.released ?? [];
  if (released.length > 0) {
    harnessGit.commit(
      "released",
      Object.fromEntries(released.map((name) => [name, skillManifest(name)])),
    );
    harnessGit.tags = [{ name: RELEASE, commit: "released" }];
    disk.makeDir(HARNESS_ROOT);
  }

  const app = inMemoryApp({
    env: {
      HOME,
      MAESTRO_HOME: "/maestro-home",
      ...(released.length > 0 ? { MAESTRO_INVENTORY_PATH: HARNESS_ROOT } : {}),
    },
    fs: disk.fileSystem(),
    copyTree: disk,
    apm,
    toolPresence: { detectGlobalTools: async () => [...state.detectedTools] },
    deployedCleanup: {
      removeSkillTargets: async ({ target, name, tools }) => {
        for (const dir of deployTargetSubtrees(name, tools)) {
          disk.remove(`${treeRoot(target)}/${dir}`);
        }
      },
    },
    git: {
      harness: harnessGit,
      originUrl: async () => ORIGIN_URL,
      inventory: () => ({
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => state.skillAtTag,
        skillDivergesFromTag: async () => state.divergedFromTag,
        readSkillFilesAtTag: async () => state.releasedFiles,
      }),
    },
  });

  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  // A git working tree the registry accepts.
  const register = async (repoPath: string) => {
    disk.write(`${repoPath}/.git`, "gitdir: elsewhere");
    const response = await post("/api/registry/repos", { path: repoPath });
    if (response.status !== 201) {
      throw new Error(`registering ${repoPath} answered ${response.status}`);
    }
  };

  return {
    app,
    disk,
    harness: harnessGit,
    answers: state,
    installs,
    uninstalls,
    post,
    register,
  };
}
