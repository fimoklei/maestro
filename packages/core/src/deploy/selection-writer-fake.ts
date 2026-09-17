// Test support: one in-memory world behind `SelectionWriter` — a manifest, a
// lockfile, the files under a tree root, and an apm that moves all three the
// way the real one does. It keeps real apm out of the fast lane while the
// Selection lifecycle is still proven end to end (testing.md, #951).
import { ConfigStore } from "../registry/config-store";
import { SelectionWriter } from "./apply-selection";
import type { DeploySkillDriverResult, DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { TargetOperationStore } from "./target-operation";

type SelectionCall = {
  command: "install" | "uninstall";
  ref: string;
  skills?: string[];
  target?: DeployTarget;
  tools?: readonly SupportedTool[];
};

export type SelectionWorld = {
  writer: SelectionWriter;
  operations: TargetOperationStore;
  calls: SelectionCall[];
  files: Map<string, string>;
  // What the next install actually places, whatever it was asked for: the
  // half-landed install the operation record exists for.
  landsOnly(skills: string[] | null): void;
  // What the next apm call answers with, for the refusals a driver classifies.
  // "throw" is the run that never returned at all.
  refuseWith(result: DeploySkillDriverResult | "throw" | null): void;
  seed(input: { release: string; skills: string[] }): void;
};

const HARNESS = "fimoklei/agent-harness";

export function selectionWorld(
  options: {
    harness?: string;
    treeRoot?: string;
    manifestPath?: string;
    lockfilePath?: string;
  } = {},
): SelectionWorld {
  const harness = options.harness ?? HARNESS;
  const treeRoot = options.treeRoot ?? "/target";
  const manifestPath = options.manifestPath ?? `${treeRoot}/apm.yml`;
  const lockfilePath = options.lockfilePath ?? `${treeRoot}/apm.lock.yaml`;

  const files = new Map<string, string>();
  const calls: SelectionCall[] = [];
  let landing: string[] | null = null;
  let refusal: DeploySkillDriverResult | "throw" | null = null;

  const manifest = (skills: readonly string[]) => `name: consumer
dependencies:
  apm:
    - git: ${harness}
      ref: v0.0.0
      skills:
${[...skills]
  .sort()
  .map((skill) => `        - ${skill}`)
  .join("\n")}
`;

  const lockfile = (release: string, skills: readonly string[]) =>
    `dependencies:
- repo_url: ${harness}
  host: github.com
  resolved_ref: ${release}
  package_type: apm_package
${
  skills.length === 0
    ? ""
    : `  deployed_files:\n${skills
        .map((skill) => `  - .claude/skills/${skill}/SKILL.md`)
        .join("\n")}\n`
}`;

  const clearCopies = () => {
    for (const path of [...files.keys()]) {
      if (path.startsWith(`${treeRoot}/.claude/skills/`)) {
        files.delete(path);
      }
    }
  };

  const fs = {
    readFile: async (path: string) => files.get(path) ?? null,
    writeFile: async (path: string, contents: string) => {
      files.set(path, contents);
    },
    isFileEntry: async (path: string) => files.has(path),
  };

  const apm = {
    deploySkill: async (input: {
      target: DeployTarget;
      ref: string;
      skills?: readonly string[];
      tools?: readonly SupportedTool[];
    }): Promise<DeploySkillDriverResult> => {
      calls.push({
        command: "install",
        ref: input.ref,
        skills: [...(input.skills ?? [])],
        target: input.target,
        ...(input.tools === undefined ? {} : { tools: input.tools }),
      });
      if (refusal === "throw") {
        throw new Error("apm exited 1 with a token in stderr");
      }
      if (refusal !== null) {
        return refusal;
      }
      const landed = landing ?? [...(input.skills ?? [])];
      clearCopies();
      for (const skill of landed) {
        files.set(`${treeRoot}/.claude/skills/${skill}/SKILL.md`, "content");
      }
      files.set(lockfilePath, lockfile(input.ref.split("#")[1] ?? "", landed));
      // apm persists the Selection it was asked for, creating the dependency
      // when it is absent (apm-behavior.md § Root package and its Selection).
      files.set(manifestPath, manifest(input.skills ?? []));
      return { ok: true };
    },
    removeSkill: async (input: { target: DeployTarget; ref: string }) => {
      calls.push({
        command: "uninstall",
        ref: input.ref,
        target: input.target,
      });
      if (refusal === "throw") {
        throw new Error("apm exited 1 with a token in stderr");
      }
      if (refusal !== null) {
        return { ok: false as const };
      }
      const kept = landing ?? [];
      clearCopies();
      for (const skill of kept) {
        files.set(`${treeRoot}/.claude/skills/${skill}/SKILL.md`, "content");
      }
      if (kept.length === 0) {
        files.delete(lockfilePath);
        files.delete(manifestPath);
      }
      return { ok: true as const };
    },
  };

  const operations = new TargetOperationStore({
    store: new ConfigStore({
      fs: fs as never,
      configPath: () => "/home/.maestro/config.json",
    }),
  });

  return {
    writer: new SelectionWriter({
      fs,
      location: {
        lockfilePath: () => lockfilePath,
        manifestPath: () => manifestPath,
        treeRoot: () => treeRoot,
      },
      apm,
      operations,
    }),
    operations,
    calls,
    files,
    landsOnly: (skills) => {
      landing = skills;
    },
    refuseWith: (result) => {
      refusal = result;
    },
    seed: ({ release, skills }) => {
      files.set(manifestPath, manifest(skills));
      files.set(lockfilePath, lockfile(release, skills));
      for (const skill of skills) {
        files.set(`${treeRoot}/.claude/skills/${skill}/SKILL.md`, "content");
      }
    },
  };
}
