import { describe, expect, it } from "vitest";
import type { DeployedContentState } from "../deploy/deploy-skill";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { GlobalDeployStateReader } from "../deploy-state/deploy-state-reader";
import { ImportLocalEdits } from "./import-local-edits";
import { ImportSkill } from "./import-skill";
import type { HarnessSkillTrees } from "./read-harness-state";

const ROOT = "/harness";
const REPO = "/work/app";
const HOME = "/home/me";
const APM_GLOBAL = `${HOME}/.apm`;
const ORIGIN = "git@github.com:fimoklei/agent-harness.git";
const HELD =
  "---\nname: code-review\ndescription: Reviews code.\n---\n\nOld.\n";
const EDITED =
  "---\nname: code-review\ndescription: Reviews code.\n---\n\nEdited.\n";

const entry = (name: string, provenance: string[]) => [
  `- virtual_path: .apm/skills/${name}`,
  "  resolved_ref: v1.0.0",
  "  package_type: claude_skill",
  ...provenance,
  "  deployed_files:",
  `  - .claude/skills/${name}`,
  `  - .claude/skills/${name}/SKILL.md`,
  `  - .agents/skills/${name}`,
  `  - .agents/skills/${name}/SKILL.md`,
];

const FROM_THIS_HARNESS = [
  "  host: github.com",
  "  repo_url: fimoklei/agent-harness",
];

type Copy = DeployedContentState;

function target(
  overrides: {
    // Per skill, per tool: what the content port reads for that copy.
    // `both`: the reading of both tools asked together, where it differs.
    copies?: Record<string, { claude?: Copy; codex?: Copy; both?: Copy }>;
    lockfile?: string[];
    trees?: HarnessSkillTrees;
    registered?: boolean;
    pending?: boolean;
    // The copy into the Harness fails for this skill: a full disk, say.
    copyFails?: string;
    // Tree per skill at v1.0.0, the release every copy was deployed from.
    release?: Record<string, string>;
    // The global install: lockfile under ~/.apm, skills under HOME.
    global?: boolean;
    // The newest release Deploy-state's row measures the repo against.
    latestRelease?: string;
  } = {},
) {
  const copies = overrides.copies ?? {
    "code-review": { claude: "diverged", codex: "clean" },
  };
  const tree = overrides.global === true ? HOME : REPO;
  const lockfilePath =
    overrides.global === true
      ? `${APM_GLOBAL}/apm.lock.yaml`
      : `${REPO}/apm.lock.yaml`;
  const files: Record<string, string> = {
    [lockfilePath]: [
      "dependencies:",
      ...(overrides.lockfile ?? entry("code-review", FROM_THIS_HARNESS)),
    ].join("\n"),
  };
  const directories = new Set(["/", ROOT, tree, `${ROOT}/.apm/skills`]);
  for (const name of Object.keys(copies)) {
    for (const prefix of [".claude", ".agents"]) {
      const folder = `${tree}/${prefix}/skills/${name}`;
      const state = copies[name]?.[prefix === ".claude" ? "claude" : "codex"];
      if (state === "not-deployed") {
        continue;
      }
      directories.add(folder);
      files[`${folder}/SKILL.md`] = state === "diverged" ? EDITED : HELD;
    }
    directories.add(`${ROOT}/.apm/skills/${name}`);
    files[`${ROOT}/.apm/skills/${name}/SKILL.md`] = HELD;
  }

  const fs = {
    realpath: async (path: string) => {
      if (!directories.has(path) && files[path] === undefined) {
        throw new Error("ENOENT");
      }
      return path;
    },
    isDirectory: async (path: string) => directories.has(path),
    isDirectoryEntry: async (path: string) => directories.has(path),
    exists: async (path: string) =>
      directories.has(path) || files[path] !== undefined,
    isFileEntry: async (path: string) => files[path] !== undefined,
    readFile: async (path: string) => files[path] ?? null,
    listRawEntries: async (path: string) => {
      const prefix = `${path}/`;
      const names = new Set<string>();
      for (const key of [...Object.keys(files), ...directories]) {
        if (key.startsWith(prefix)) {
          names.add(key.slice(prefix.length).split("/")[0] as string);
        }
      }
      return [...names].map((name) => ({
        name,
        isDirectory: directories.has(prefix + name),
        isSymlink: false,
      }));
    },
    writeFile: async (path: string, contents: string) => {
      files[path] = contents;
    },
    createNewFile: async () => false,
    remove: async () => {},
    ensureDir: async (path: string) => {
      directories.add(path);
    },
  };

  const content = {
    classify: async (input: { name: string; tools?: readonly string[] }) => {
      const reading = copies[input.name] ?? {};
      if (reading.both !== undefined && (input.tools?.length ?? 2) === 2) {
        return reading.both;
      }
      const states = (input.tools ?? ["claude", "codex"]).map(
        (tool) => reading[tool as "claude" | "codex"] ?? "clean",
      );
      if (states.length === 1) {
        return states[0] as Copy;
      }
      if (states.includes("diverged")) {
        return "diverged" as const;
      }
      return states.includes("unverifiable")
        ? ("unverifiable" as const)
        : ("clean" as const);
    },
  };

  let trees: HarnessSkillTrees = overrides.trees ?? {
    remote: {},
    promote: {},
    local: Object.fromEntries(Object.keys(copies).map((n) => [n, "tree-1"])),
    working: Object.fromEntries(Object.keys(copies).map((n) => [n, "tree-1"])),
  };

  const facts = {
    describe: async (path: string) =>
      files[path] === undefined
        ? null
        : {
            kind: "file" as const,
            size: (files[path] as string).length,
            hardLinks: 1,
            executable: false,
            identity: path,
          },
  };
  const importSkill = new ImportSkill({
    resolveRoot: async () => ROOT,
    homeRoot: () => "/",
    fs,
    facts,
    git: {
      readFacts: async () => ({
        originUrl: ORIGIN,
        defaultBranch: "main",
        defaultBranchCommit: null,
        tags: [],
      }),
      readMovementTrees: async () => trees,
    },
    copy: {
      copy: async (input) => {
        if (input.name === overrides.copyFails) {
          return { ok: false as const, error: "copy-failed" as const };
        }
        const path = `${input.destinationParent}/${input.name}`;
        directories.add(path);
        files[`${path}/SKILL.md`] = files[`${input.source}/SKILL.md`] as string;
        return { ok: true, path, skipped: 0 };
      },
    },
    deployedTargets: async () => [{ treeRoot: tree, lockfilePath }],
  });

  let release: Record<string, string> | null = overrides.release ?? {
    ...trees.local,
  };
  const harnessReads = { movementTrees: 0, roots: 0 };
  const harnessGit = {
    readMovementTrees: async () => {
      harnessReads.movementTrees += 1;
      return trees;
    },
    readSkillTreesAtTag: async (_root: string, tag: string) => {
      if (release === null) {
        throw new Error("tag unreadable");
      }
      return tag === "v1.0.0"
        ? Object.entries(release).map(([name, treeHash]) => ({
            name,
            treeHash,
          }))
        : null;
    },
  };
  const reader = new GlobalDeployStateReader({
    fs,
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    treeRoot: () => HOME,
    content,
    operations: {
      pending: async () =>
        overrides.pending === true
          ? {
              kind: "deploy" as const,
              release: "v1.0.0",
              desired: ["code-review"],
            }
          : null,
    },
  });
  const latestRelease = overrides.latestRelease;

  const locks = new InFlightLocks();
  const useCase = new ImportLocalEdits({
    registry: {
      resolveRegistered: async (path: string) =>
        overrides.registered === false || path !== REPO
          ? undefined
          : { path: REPO },
    },
    deployState: {
      read: async (path: string) => {
        const state = await reader.read(path);
        return state.ok && latestRelease !== undefined
          ? {
              ...state,
              releaseHead: {
                release: "v1.0.0",
                latestRelease,
                changed: 0,
                selected: 1,
                comparedAt: null,
              },
            }
          : state;
      },
      readGlobal: (root: string) => reader.readGlobal(root),
    },
    content,
    tree: { ...fs, ...facts },
    globalRoot: () => APM_GLOBAL,
    home: () => HOME,
    importSkill,
    git: harnessGit,
    resolveRoot: async () => {
      harnessReads.roots += 1;
      return ROOT;
    },
    locks,
  });

  const edit = (name: string, tool: "claude" | "codex", state: Copy) => {
    copies[name] = { ...copies[name], [tool]: state };
  };
  const setTrees = (next: HarnessSkillTrees) => {
    trees = next;
  };
  const setRelease = (next: Record<string, string> | null) => {
    release = next;
  };
  return { useCase, files, locks, edit, setTrees, setRelease, harnessReads };
}

const REPO_TARGET = { kind: "repo" as const, repoPath: REPO };
const GLOBAL_TARGET = { kind: "global" as const };

describe("ImportLocalEdits.check", () => {
  it("lists every Local edits skill from this Harness as eligible", async () => {
    const { useCase } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { codex: "diverged" },
        clean: {},
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
        ...entry("clean", FROM_THIS_HARNESS),
      ],
    });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: null },
        { name: "tdd", refusal: null },
      ],
    });
  });

  it("refuses a skill Import skill would add rather than update", async () => {
    // No record lists the deployed folder: ImportSkill proves no origin.
    const { useCase } = target({
      lockfile: [
        "- virtual_path: .apm/skills/code-review",
        "  resolved_ref: v1.0.0",
        "  package_type: claude_skill",
        ...FROM_THIS_HARNESS,
      ],
    });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [{ name: "code-review", refusal: "not-an-update" }],
    });
  });

  it("refuses another Harness's copy, an unproven origin and an Unverified copy, each by its own code", async () => {
    const { useCase } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
        lint: { claude: "unverifiable" },
      },
      lockfile: [
        ...entry("code-review", [
          "  host: github.com",
          "  repo_url: someone/other-harness",
        ]),
        ...entry("tdd", []),
        ...entry("lint", FROM_THIS_HARNESS),
      ],
    });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: "deployed-copy" },
        { name: "tdd", refusal: "origin-unproven" },
        { name: "lint", refusal: "unverified" },
      ],
    });
  });

  it("refuses a skill with uncommitted Harness changes and one whose edit the Harness holds", async () => {
    const { useCase, files, setTrees } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
      ],
    });
    setTrees({
      remote: {},
      promote: {},
      local: { "code-review": "tree-1", tdd: "tree-1" },
      working: { "code-review": "tree-2", tdd: "tree-1" },
    });
    // Import stamps the recorded name into the frontmatter before comparing.
    files[`${ROOT}/.apm/skills/tdd/SKILL.md`] = EDITED.replace(
      "name: code-review",
      "name: tdd",
    );

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: "harness-copy-uncommitted" },
        { name: "tdd", refusal: "nothing-to-carry-back" },
      ],
    });
  });

  it("judges a Local edits row whose edit no single tool folder holds, never calling it unedited", async () => {
    // The Claude Code folder was deleted: together the copies read edited,
    // apart the Codex copy reads clean and the other reads not deployed.
    const { useCase } = target({
      copies: {
        "code-review": { both: "diverged", claude: "not-deployed" },
      },
    });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [{ name: "code-review", refusal: "nothing-to-carry-back" }],
    });
  });

  it("flags a skill whose Harness copy changed since its deployed release", async () => {
    const { useCase } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
      ],
      release: { "code-review": "tree-0", tdd: "tree-1" },
    });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: null, undoesNewerSince: "v1.0.0" },
        { name: "tdd", refusal: null },
      ],
    });
  });

  it("flags a skill whose deployed release the Harness cannot read", async () => {
    const { useCase, setRelease } = target();
    setRelease({});

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: null, undoesNewerSince: "v1.0.0" },
      ],
    });
  });

  it("never flags a skill deployed from the latest release, even when its tag is unreadable", async () => {
    const { useCase, setRelease } = target({ latestRelease: "v1.0.0" });
    setRelease(null);

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [{ name: "code-review", refusal: null }],
    });
  });

  it("flags a skill from an older release whose tag is unreadable", async () => {
    const { useCase, setRelease } = target({ latestRelease: "v1.1.0" });
    setRelease(null);

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: null, undoesNewerSince: "v1.0.0" },
      ],
    });
  });

  it("reads the Harness state once per check, whatever the skill count", async () => {
    const { useCase, harnessReads } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
        lint: { claude: "diverged" },
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
        ...entry("lint", FROM_THIS_HARNESS),
      ],
    });

    await useCase.check(REPO_TARGET);

    expect(harnessReads).toEqual({ roots: 1, movementTrees: 1 });
  });

  it("lists a global skill with identical Claude Code and Codex edits as eligible", async () => {
    const { useCase } = target({
      global: true,
      copies: { "code-review": { claude: "diverged", codex: "diverged" } },
    });

    await expect(useCase.check(GLOBAL_TARGET)).resolves.toEqual({
      ok: true,
      skills: [{ name: "code-review", refusal: null }],
    });
  });

  it("refuses a global skill whose tool copies differ, naming both folders from home", async () => {
    const { useCase, files } = target({
      global: true,
      copies: { "code-review": { claude: "diverged", codex: "diverged" } },
    });
    files[`${HOME}/.agents/skills/code-review/SKILL.md`] = `${EDITED}More.\n`;

    await expect(useCase.check(GLOBAL_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        {
          name: "code-review",
          refusal: "copies-differ",
          folders: {
            claude: "~/.claude/skills/code-review",
            codex: "~/.agents/skills/code-review",
          },
        },
      ],
    });
  });

  it("refuses a target with an Unfinished operation", async () => {
    const { useCase } = target({ pending: true });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: false,
      error: "unfinished-operation",
    });
  });

  it("refuses a repository outside the registry", async () => {
    const { useCase } = target({ registered: false });

    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: false,
      error: "repo-not-registered",
    });
  });
});

describe("ImportLocalEdits.execute", () => {
  it("lands the edited copy in the Working Harness", async () => {
    const { useCase, files } = target();

    const result = await useCase.execute({
      target: REPO_TARGET,
      names: ["code-review"],
      undo: [],
    });

    expect(result).toEqual({
      ok: true,
      outcomes: [{ name: "code-review", refusal: null }],
    });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(EDITED);
  });

  it("lands identical global tool edits as one skill", async () => {
    const { useCase, files } = target({
      global: true,
      copies: { "code-review": { claude: "diverged", codex: "diverged" } },
    });

    await expect(
      useCase.execute({
        target: GLOBAL_TARGET,
        names: ["code-review"],
        undo: [],
      }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [{ name: "code-review", refusal: null }],
    });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(EDITED);
  });

  it("refuses a skill that no longer reads Local edits", async () => {
    const { useCase, edit, files } = target();
    edit("code-review", "claude", "clean");

    await expect(
      useCase.execute({
        target: REPO_TARGET,
        names: ["code-review"],
        undo: [],
      }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [{ name: "code-review", refusal: "no-local-edits" }],
    });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(HELD);
  });

  it("re-judges at execute and still lands the other skills", async () => {
    const { useCase, setTrees } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
      ],
    });
    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [
        { name: "code-review", refusal: null },
        { name: "tdd", refusal: null },
      ],
    });
    setTrees({
      remote: {},
      promote: {},
      local: { "code-review": "tree-1", tdd: "tree-1" },
      working: { "code-review": "tree-2", tdd: "tree-1" },
    });

    await expect(
      useCase.execute({
        target: REPO_TARGET,
        names: ["code-review", "tdd"],
        undo: [],
      }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [
        { name: "code-review", refusal: "harness-copy-uncommitted" },
        { name: "tdd", refusal: null },
      ],
    });
  });

  it("lands a flagged skill only where the author chose to undo the newer changes", async () => {
    const { useCase, files } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
      ],
      release: { "code-review": "tree-0", tdd: "tree-0" },
    });

    await expect(
      useCase.execute({
        target: REPO_TARGET,
        names: ["code-review", "tdd"],
        undo: ["tdd"],
      }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [
        { name: "code-review", refusal: "undoes-newer-changes" },
        { name: "tdd", refusal: null },
      ],
    });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(HELD);
    expect(files[`${ROOT}/.apm/skills/tdd/SKILL.md`]).toBe(EDITED);
  });

  it("refuses a skill the Harness moved past its release after the check", async () => {
    const { useCase, setTrees } = target();
    await expect(useCase.check(REPO_TARGET)).resolves.toEqual({
      ok: true,
      skills: [{ name: "code-review", refusal: null }],
    });
    // A teammate's change pulled in: committed, so Import skill still allows it.
    setTrees({
      remote: {},
      promote: {},
      local: { "code-review": "tree-2" },
      working: { "code-review": "tree-2" },
    });

    await expect(
      useCase.execute({
        target: REPO_TARGET,
        names: ["code-review"],
        undo: [],
      }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [{ name: "code-review", refusal: "undoes-newer-changes" }],
    });
  });

  it("keeps landing the other skills when one fails to copy", async () => {
    const { useCase, files } = target({
      copies: {
        "code-review": { claude: "diverged" },
        tdd: { claude: "diverged" },
      },
      lockfile: [
        ...entry("code-review", FROM_THIS_HARNESS),
        ...entry("tdd", FROM_THIS_HARNESS),
      ],
      copyFails: "code-review",
    });

    await expect(
      useCase.execute({
        target: REPO_TARGET,
        names: ["code-review", "tdd"],
        undo: [],
      }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [
        { name: "code-review", refusal: "copy-failed" },
        { name: "tdd", refusal: null },
      ],
    });
    expect(files[`${ROOT}/.apm/skills/tdd/SKILL.md`]).toBe(EDITED);
  });

  it("refuses the run while another Harness change holds the lock", async () => {
    const { useCase, locks, files } = target();
    let result: unknown;

    await locks.run(ROOT, async () => {
      result = await useCase.execute({
        target: REPO_TARGET,
        names: ["code-review"],
        undo: [],
      });
    });

    expect(result).toEqual({ ok: false, error: "import-in-progress" });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(HELD);
  });
});
