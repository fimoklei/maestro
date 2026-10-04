// Test support: an in-memory manifest, lockfile and tree behind
// `SelectionWriter`, with an apm that moves all three like the real one.
import { ConfigStore } from "../registry/config-store";
import { SelectionWriter } from "./apply-selection";
import type {
  DeployedCleanupPort,
  DeploySkillDriverResult,
  DeployTarget,
} from "./deploy-skill";
import {
  DEPLOY_TOOLS,
  deployTargetSubtrees,
  SUPPORTED_TOOLS,
  type SupportedTool,
} from "./deploy-tools";
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
  // Deletes a skill's folder per tool, as `DeployedCleanupAdapter` does.
  cleanup: DeployedCleanupPort;
  // The operator edited this copy: apm keeps it and its lockfile row when an
  // install drops the skill (#1340).
  edits(tool: SupportedTool, skill: string): void;
  // What the next install actually places, whatever it was asked for.
  landsOnly(skills: string[] | null): void;
  // The next install leaves this one tool's copy of a skill off disk, keeping
  // its lockfile row as apm does.
  skipsCopy(tool: SupportedTool, skill: string): void;
  // "throw" is the run that never returned at all.
  refuseWith(result: DeploySkillDriverResult | "throw" | null): void;
  seed(input: { release: string; skills: string[] }): void;
};

const HARNESS = "fimoklei/agent-harness";

// Relative to the tree root: one copy per skill per tool, as apm places them.
export const copyPaths = (
  skills: readonly string[],
  tools: readonly SupportedTool[],
): string[] =>
  skills.flatMap((skill) =>
    DEPLOY_TOOLS.filter((tool) => tools.includes(tool.apmTarget)).map(
      (tool) => `${tool.skillsDirPrefix}/skills/${skill}/SKILL.md`,
    ),
  );

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
  let skipped: string | null = null;
  let refusal: DeploySkillDriverResult | "throw" | null = null;
  const edited = new Set<string>();

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

  const lockfile = (
    release: string,
    skills: readonly string[],
    tools: readonly SupportedTool[],
    kept: readonly string[],
  ) =>
    `dependencies:
- repo_url: ${harness}
  host: github.com
  resolved_ref: ${release}
  package_type: apm_package
${
  skills.length === 0 && kept.length === 0
    ? ""
    : `  deployed_files:\n${[...copyPaths(skills, tools), ...kept]
        .map((path) => `  - ${path}`)
        .join("\n")}\n`
}`;

  const clearCopies = () => {
    for (const path of [...files.keys()]) {
      if (
        !edited.has(path) &&
        DEPLOY_TOOLS.some((tool) =>
          path.startsWith(`${treeRoot}/${tool.skillsDirPrefix}/skills/`),
        )
      ) {
        files.delete(path);
      }
    }
  };

  const place = (
    skills: readonly string[],
    tools: readonly SupportedTool[],
  ) => {
    for (const path of copyPaths(skills, tools)) {
      files.set(`${treeRoot}/${path}`, "content");
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
      const tools = input.tools ?? SUPPORTED_TOOLS;
      clearCopies();
      place(landed, tools);
      if (skipped !== null) {
        files.delete(`${treeRoot}/${skipped}`);
        skipped = null;
      }
      const placed = new Set(copyPaths(landed, tools));
      const kept = [...edited]
        .filter((path) => files.has(path))
        .map((path) => path.slice(treeRoot.length + 1))
        .filter((path) => !placed.has(path));
      files.set(
        lockfilePath,
        lockfile(input.ref.split("#")[1] ?? "", landed, tools, kept),
      );
      // apm persists the Selection it was asked for, creating the dependency
      // when it is absent.
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
      place(kept, SUPPORTED_TOOLS);
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
    cleanup: {
      removeSkillTargets: async ({ name, tools }) => {
        for (const subtree of deployTargetSubtrees(name, tools)) {
          for (const path of [...files.keys()]) {
            if (path.startsWith(`${treeRoot}/${subtree}/`)) {
              files.delete(path);
            }
          }
        }
      },
    },
    edits: (tool, skill) => {
      for (const path of copyPaths([skill], [tool])) {
        edited.add(`${treeRoot}/${path}`);
      }
    },
    landsOnly: (skills) => {
      landing = skills;
    },
    skipsCopy: (tool, skill) => {
      [skipped = null] = copyPaths([skill], [tool]);
    },
    refuseWith: (result) => {
      refusal = result;
    },
    seed: ({ release, skills }) => {
      files.set(manifestPath, manifest(skills));
      files.set(lockfilePath, lockfile(release, skills, SUPPORTED_TOOLS, []));
      place(skills, SUPPORTED_TOOLS);
    },
  };
}
