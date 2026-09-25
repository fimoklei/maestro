// A Selection writer over real temp roots, driven by a fake apm that moves
// the manifest, the lockfile and the deployed files the way the real one does.
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type ApmDriverPort,
  ConfigStore,
  DEPLOY_TOOLS,
  type DeployTarget,
  NodeFileSystem,
  SelectionWriter,
  type SupportedTool,
  TargetOperationStore,
} from "@maestro/core";

const HARNESS = "fimoklei/agent-harness";

const skillBody = (name: string) => `---\nname: ${name}\n---\n`;

type Install = {
  target: DeployTarget;
  ref: string;
  skills: readonly string[];
  tools?: readonly SupportedTool[];
};

export type RootPackageApm = Pick<
  ApmDriverPort,
  "deploySkill" | "removeSkill"
> & {
  installs: Install[];
  uninstalls: { ref: string }[];
};

export function rootPackageLocation(globalRoot: string) {
  const root = (target: DeployTarget) =>
    target.kind === "repo" ? target.repoPath : globalRoot;
  return {
    treeRoot: root,
    lockfilePath: (target: DeployTarget) => join(root(target), "apm.lock.yaml"),
    manifestPath: (target: DeployTarget) => join(root(target), "apm.yml"),
  };
}

export function rootPackageApm(options: {
  globalRoot: string;
  // What the install actually places, whatever it was asked for.
  lands?: (skills: readonly string[]) => readonly string[];
  // False leaves the deployed copies to the test; the lockfile still records them.
  placesFiles?: boolean;
}): RootPackageApm {
  const location = rootPackageLocation(options.globalRoot);
  const installs: Install[] = [];
  const uninstalls: { ref: string }[] = [];

  const prefixesFor = (tools: readonly SupportedTool[] | undefined) =>
    DEPLOY_TOOLS.filter(
      (tool) => tools === undefined || tools.includes(tool.apmTarget),
    ).map((tool) => tool.skillsDirPrefix);

  const placeSkills = async (
    target: DeployTarget,
    names: readonly string[],
    tools: readonly SupportedTool[] | undefined,
  ): Promise<string[]> => {
    const tree = location.treeRoot(target);
    const files: string[] = [];
    // Only what the previous lockfile recorded goes: apm leaves an unmanaged
    // directory in place.
    const recorded = new Set(
      [
        ...(
          (await readFile(location.lockfilePath(target), "utf8").catch(
            () => "",
          )) as string
        ).matchAll(/^ {2}- (\S+\/skills\/[^/\s]+)\//gm),
      ].map((match) => match[1] as string),
    );
    if (options.placesFiles !== false) {
      for (const dir of recorded) {
        await rm(join(tree, dir), { recursive: true, force: true });
      }
    }
    for (const prefix of prefixesFor(tools)) {
      for (const name of names) {
        const rel = `${prefix}/skills/${name}/SKILL.md`;
        files.push(rel);
        if (options.placesFiles !== false) {
          await mkdir(dirname(join(tree, rel)), { recursive: true });
          await writeFile(join(tree, rel), skillBody(name), "utf8");
        }
      }
    }
    return files;
  };

  return {
    installs,
    uninstalls,
    deploySkill: async (input) => {
      installs.push({
        target: input.target,
        ref: input.ref,
        skills: input.skills ?? [],
        ...(input.tools === undefined ? {} : { tools: input.tools }),
      });
      const landed = options.lands
        ? options.lands(input.skills ?? [])
        : (input.skills ?? []);
      const files = await placeSkills(input.target, landed, input.tools);
      await writeFile(
        location.lockfilePath(input.target),
        await lockfile(
          location.treeRoot(input.target),
          input.ref.split("#")[1] ?? "",
          files,
        ),
        "utf8",
      );
      await writeFile(
        location.manifestPath(input.target),
        manifest([...(input.skills ?? [])].sort()),
        "utf8",
      );
      return { ok: true };
    },
    removeSkill: async (input) => {
      uninstalls.push({ ref: input.ref });
      await placeSkills(input.target, [], undefined);
      await rm(location.lockfilePath(input.target), { force: true });
      await rm(location.manifestPath(input.target), { force: true });
      return { ok: true };
    },
  };
}

export function rootPackageSelection(deps: {
  globalRoot: string;
  configPath: string;
  apm: Pick<ApmDriverPort, "deploySkill" | "removeSkill">;
}): SelectionWriter {
  const fs = new NodeFileSystem();
  return new SelectionWriter({
    fs,
    location: rootPackageLocation(deps.globalRoot),
    apm: deps.apm,
    operations: new TargetOperationStore({
      store: new ConfigStore({ fs, configPath: () => deps.configPath }),
    }),
  });
}

export const manifest = (skills: readonly string[]) => `name: consumer
version: 1.0.0
dependencies:
  apm:
    - git: ${HARNESS}
      ref: v0.5.1
      skills:
${skills.map((skill) => `        - ${skill}`).join("\n")}
  mcp: []
`;

// A file the test never wrote gets no hash, rather than a made-up one.
const lockfile = async (
  tree: string,
  release: string,
  files: readonly string[],
) => {
  const hashes: string[] = [];
  for (const file of files) {
    const bytes = await readFile(join(tree, file)).catch(() => null);
    if (bytes !== null) {
      hashes.push(
        `    ${file}: sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      );
    }
  }
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
