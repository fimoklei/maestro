import { beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { applySelection } from "./apply-selection";
import { TargetOperationStore } from "./target-operation";

const HARNESS = "fimoklei/agent-harness";
const origin = { host: "github.com", ownerRepo: HARNESS };
const target = { kind: "repo", repoPath: "/repo" } as const;

const manifest = (skills: string[]) => `name: proj
dependencies:
  apm:
    - git: ${HARNESS}
      ref: v0.6.0
      skills:
${skills.map((skill) => `        - ${skill}`).join("\n")}
`;

const lockfile = (release: string, skills: string[]) => `dependencies:
- repo_url: ${HARNESS}
  host: github.com
  resolved_ref: ${release}
  package_type: apm_package
  deployed_files:
${skills.map((skill) => `  - .claude/skills/${skill}/SKILL.md`).join("\n")}
`;

// One in-memory world: the manifest, the lockfile and the files on disk, all
// moved by the fake apm exactly as the real one moves them.
function world() {
  const files = new Map<string, string>();
  const calls: { command: string; ref: string; skills?: string[] }[] = [];
  let landing: string[] | null = null;

  const fs = {
    readFile: async (path: string) => files.get(path) ?? null,
    writeFile: async (path: string, contents: string) => {
      files.set(path, contents);
    },
    isFileEntry: async (path: string) => files.has(path),
  };

  const install = (release: string, skills: readonly string[]) => {
    const landed = landing ?? [...skills];
    for (const key of [...files.keys()]) {
      if (key.startsWith("/repo/.claude/skills/")) {
        files.delete(key);
      }
    }
    for (const skill of landed) {
      files.set(`/repo/.claude/skills/${skill}/SKILL.md`, "content");
    }
    files.set("/repo/apm.lock.yaml", lockfile(release, landed));
    // apm persists the Selection into apm.yml itself, creating the dependency
    // when it is absent (apm-behavior.md § Root package and its Selection).
    files.set("/repo/apm.yml", manifest([...skills].sort()));
  };

  const apm = {
    deploySkill: async (input: { ref: string; skills?: readonly string[] }) => {
      calls.push({
        command: "install",
        ref: input.ref,
        skills: [...(input.skills ?? [])],
      });
      const release = input.ref.split("#")[1] as string;
      install(release, input.skills ?? []);
      return { ok: true as const };
    },
    removeSkill: async (input: { ref: string }) => {
      calls.push({ command: "uninstall", ref: input.ref });
      for (const key of [...files.keys()]) {
        if (key.startsWith("/repo/.claude/skills/")) {
          files.delete(key);
        }
      }
      files.delete("/repo/apm.lock.yaml");
      files.delete("/repo/apm.yml");
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
    files,
    calls,
    operations,
    landsOnly: (skills: string[]) => {
      landing = skills;
    },
    deps: {
      fs,
      location: {
        lockfilePath: () => "/repo/apm.lock.yaml",
        manifestPath: () => "/repo/apm.yml",
        treeRoot: () => "/repo",
      },
      apm,
      operations,
    },
  };
}

const write = (over: Partial<Parameters<typeof applySelection>[1]> = {}) => ({
  target,
  key: "/repo",
  kind: "deploy" as const,
  origin,
  release: "v0.6.0",
  previous: ["prototype"],
  desired: ["prototype", "review"],
  ...over,
});

describe("applySelection", () => {
  let stage: ReturnType<typeof world>;

  beforeEach(() => {
    stage = world();
    stage.files.set("/repo/apm.yml", manifest(["prototype"]));
    stage.files.set("/repo/apm.lock.yaml", lockfile("v0.6.0", ["prototype"]));
    stage.files.set("/repo/.claude/skills/prototype/SKILL.md", "content");
  });

  it("writes the exact selection to the manifest and installs the root ref with it", async () => {
    const result = await applySelection(stage.deps, write());

    expect(result).toEqual({ ok: true });
    expect(stage.calls).toEqual([
      {
        command: "install",
        ref: `github.com/${HARNESS}#v0.6.0`,
        skills: ["prototype", "review"],
      },
    ]);
    expect(stage.files.get("/repo/apm.yml")).toContain("- review");
  });

  it("writes a removed skill's name out of the manifest", async () => {
    stage.files.set("/repo/apm.yml", manifest(["caveman", "prototype"]));
    stage.files.set("/repo/.claude/skills/caveman/SKILL.md", "content");

    await applySelection(
      stage.deps,
      write({
        kind: "remove",
        previous: ["caveman", "prototype"],
        desired: ["prototype"],
      }),
    );

    expect(stage.files.get("/repo/apm.yml")).not.toContain("caveman");
    expect(stage.files.has("/repo/.claude/skills/caveman/SKILL.md")).toBe(
      false,
    );
  });

  it("lets apm create an absent Harness dependency on a first deploy", async () => {
    stage.files.delete("/repo/apm.yml");
    stage.files.delete("/repo/apm.lock.yaml");
    stage.files.delete("/repo/.claude/skills/prototype/SKILL.md");

    const result = await applySelection(
      stage.deps,
      write({ previous: [], desired: ["review"] }),
    );

    expect(result).toEqual({ ok: true });
    expect(stage.calls).toEqual([
      {
        command: "install",
        ref: `github.com/${HARNESS}#v0.6.0`,
        skills: ["review"],
      },
    ]);
  });

  it("refuses an unrecognised manifest before any write", async () => {
    stage.files.set(
      "/repo/apm.yml",
      `dependencies:\n  apm:\n    - github.com/${HARNESS}#v0.6.0\n`,
    );

    const result = await applySelection(stage.deps, write());

    expect(result).toEqual({ ok: false, error: "manifest-not-recognised" });
    expect(stage.calls).toEqual([]);
    expect(await stage.operations.read("/repo")).toBeNull();
  });

  it("removes the last skill with the named uninstall of the Harness dependency", async () => {
    const result = await applySelection(
      stage.deps,
      write({ kind: "remove", previous: ["prototype"], desired: [] }),
    );

    expect(result).toEqual({ ok: true });
    expect(stage.calls).toEqual([
      { command: "uninstall", ref: `github.com/${HARNESS}#v0.6.0` },
    ]);
  });

  it("persists the desired operation before the first mutation", async () => {
    let recorded: unknown = "not read";
    const apm = {
      ...stage.deps.apm,
      deploySkill: async (input: {
        ref: string;
        skills?: readonly string[];
      }) => {
        recorded = await stage.operations.read("/repo");
        return await stage.deps.apm.deploySkill(input);
      },
    };

    await applySelection({ ...stage.deps, apm }, write());

    expect(recorded).toMatchObject({
      kind: "deploy",
      release: "v0.6.0",
      desired: ["prototype", "review"],
      previous: ["prototype"],
    });
  });

  it("clears the operation once disk, manifest and record agree with it", async () => {
    await applySelection(stage.deps, write());
    expect(await stage.operations.read("/repo")).toBeNull();
  });

  it("keeps the operation and reports incomplete when a skill did not land", async () => {
    stage.landsOnly(["prototype"]);

    const result = await applySelection(stage.deps, write());

    expect(result).toEqual({ ok: false, error: "apply-incomplete" });
    expect(await stage.operations.read("/repo")).toMatchObject({
      desired: ["prototype", "review"],
    });
  });

  it("keeps the operation when the record shows the tag but not the files", async () => {
    stage.landsOnly([]);

    const result = await applySelection(stage.deps, write());

    expect(result).toEqual({ ok: false, error: "apply-incomplete" });
  });

  it("keeps the operation when a removed skill's file survives", async () => {
    stage.files.set("/repo/.claude/skills/caveman/SKILL.md", "edited");
    stage.landsOnly(["prototype", "caveman"]);

    const result = await applySelection(
      stage.deps,
      write({
        kind: "remove",
        previous: ["caveman", "prototype"],
        desired: ["prototype"],
      }),
    );

    expect(result).toEqual({ ok: false, error: "apply-incomplete" });
  });

  it("reports a failed install without claiming anything about disk", async () => {
    const apm = {
      ...stage.deps.apm,
      deploySkill: async () => ({
        ok: false as const,
        reason: "failed" as const,
      }),
    };

    const result = await applySelection({ ...stage.deps, apm }, write());

    expect(result).toEqual({ ok: false, error: "apply-failed" });
    expect(await stage.operations.read("/repo")).toMatchObject({
      kind: "deploy",
    });
  });

  it("passes a symlinked destination through as its own refusal", async () => {
    const apm = {
      ...stage.deps.apm,
      deploySkill: async () => ({
        ok: false as const,
        reason: "destination-symlinked" as const,
      }),
    };

    const result = await applySelection({ ...stage.deps, apm }, write());

    expect(result).toEqual({ ok: false, error: "destination-symlinked" });
  });
});
