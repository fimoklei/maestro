import { describe, expect, it } from "vitest";
import type { DeployedContentState } from "../deploy/deploy-skill";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { DeployStateReader } from "../deploy-state/deploy-state-reader";
import { ImportLocalEdits } from "./import-local-edits";
import { ImportSkill } from "./import-skill";
import type { HarnessSkillTrees } from "./read-harness-state";

const ROOT = "/harness";
const REPO = "/work/app";
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
    copies?: Record<string, { claude?: Copy; codex?: Copy }>;
    lockfile?: string[];
    trees?: HarnessSkillTrees;
    registered?: boolean;
    pending?: boolean;
  } = {},
) {
  const copies = overrides.copies ?? {
    "code-review": { claude: "diverged", codex: "clean" },
  };
  const files: Record<string, string> = {
    [`${REPO}/apm.lock.yaml`]: [
      "dependencies:",
      ...(overrides.lockfile ?? entry("code-review", FROM_THIS_HARNESS)),
    ].join("\n"),
  };
  const directories = new Set(["/", ROOT, REPO, `${ROOT}/.apm/skills`]);
  for (const name of Object.keys(copies)) {
    for (const prefix of [".claude", ".agents"]) {
      const folder = `${REPO}/${prefix}/skills/${name}`;
      directories.add(folder);
      files[`${folder}/SKILL.md`] =
        copies[name]?.[prefix === ".claude" ? "claude" : "codex"] === "diverged"
          ? EDITED
          : HELD;
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
      const states = (input.tools ?? ["claude", "codex"]).map(
        (tool) => reading[tool as "claude" | "codex"] ?? "clean",
      );
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

  const importSkill = new ImportSkill({
    resolveRoot: async () => ROOT,
    homeRoot: () => "/",
    fs,
    facts: {
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
    },
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
        const path = `${input.destinationParent}/${input.name}`;
        directories.add(path);
        files[`${path}/SKILL.md`] = files[`${input.source}/SKILL.md`] as string;
        return { ok: true, path, skipped: 0 };
      },
    },
    deployedTargets: async () => [
      { treeRoot: REPO, lockfilePath: `${REPO}/apm.lock.yaml` },
    ],
  });

  const locks = new InFlightLocks();
  const useCase = new ImportLocalEdits({
    registry: {
      resolveRegistered: async (path: string) =>
        overrides.registered === false || path !== REPO
          ? undefined
          : { path: REPO },
    },
    deployState: new DeployStateReader({
      fs,
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
    }),
    content,
    importSkill,
    resolveRoot: async () => ROOT,
    locks,
  });

  const edit = (name: string, tool: "claude" | "codex", state: Copy) => {
    copies[name] = { ...copies[name], [tool]: state };
  };
  const setTrees = (next: HarnessSkillTrees) => {
    trees = next;
  };
  return { useCase, files, locks, edit, setTrees };
}

const REPO_TARGET = { kind: "repo" as const, repoPath: REPO };

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
    });

    expect(result).toEqual({
      ok: true,
      outcomes: [{ name: "code-review", refusal: null }],
    });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(EDITED);
  });

  it("refuses a skill that no longer reads Local edits", async () => {
    const { useCase, edit, files } = target();
    edit("code-review", "claude", "clean");

    await expect(
      useCase.execute({ target: REPO_TARGET, names: ["code-review"] }),
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
    setTrees({
      remote: {},
      promote: {},
      local: { "code-review": "tree-1", tdd: "tree-1" },
      working: { "code-review": "tree-2", tdd: "tree-1" },
    });

    await expect(
      useCase.execute({ target: REPO_TARGET, names: ["code-review", "tdd"] }),
    ).resolves.toEqual({
      ok: true,
      outcomes: [
        { name: "code-review", refusal: "harness-copy-uncommitted" },
        { name: "tdd", refusal: null },
      ],
    });
  });

  it("refuses the run while another Harness change holds the lock", async () => {
    const { useCase, locks, files } = target();
    let result: unknown;

    await locks.run(ROOT, async () => {
      result = await useCase.execute({
        target: REPO_TARGET,
        names: ["code-review"],
      });
    });

    expect(result).toEqual({ ok: false, error: "import-in-progress" });
    expect(files[`${ROOT}/.apm/skills/code-review/SKILL.md`]).toBe(HELD);
  });
});
