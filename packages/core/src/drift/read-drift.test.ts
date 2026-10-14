import { describe, expect, it, vi } from "vitest";
import { DeployedLocation } from "../deploy/deployed-location";
import type { GitOrigin } from "../deploy/git-origin";
import type { HarnessSkillTree } from "../harness/skill-movements";
import type { OutdatedResult } from "./parse-outdated";
import { ReadDrift } from "./read-drift";

const ORIGIN: GitOrigin = { host: "github.com", ownerRepo: "fimoklei/harness" };

const lockfile = (
  entries: { name: string; ref: string; repoUrl?: string }[],
): string =>
  `dependencies:\n${entries
    .map(
      ({ name, ref, repoUrl = "fimoklei/harness" }) =>
        `- repo_url: ${repoUrl}\n  host: github.com\n  resolved_ref: ${ref}\n  virtual_path: .apm/skills/${name}\n  package_type: claude_skill\n`,
    )
    .join("")}`;

const trees = (entries: Record<string, string>): HarnessSkillTree[] =>
  Object.entries(entries).map(([name, treeHash]) => ({ name, treeHash }));

const build = (options: {
  outdated: OutdatedResult;
  lock?: string | null;
  root?: string | undefined;
  origin?: GitOrigin | null;
  refs?: Record<string, HarnessSkillTree[] | null>;
  fetch?: () => Promise<unknown>;
}) => {
  const refs = options.refs ?? {};
  const readSkillTreesAtTag = vi.fn(async (_root: string, ref: string) =>
    ref in refs ? (refs[ref] as HarnessSkillTree[] | null) : null,
  );
  const fetch = vi.fn(options.fetch ?? (async () => undefined));
  const readDrift = new ReadDrift({
    drift: { execute: async () => options.outdated },
    fs: { readFile: async () => options.lock ?? null },
    location: new DeployedLocation({}),
    resolveRoot: async () => ("root" in options ? options.root : "/harness"),
    git: {
      fetch,
      readOrigin: async () =>
        options.origin === undefined ? ORIGIN : options.origin,
      readSkillTreesAtTag,
    },
  });
  return { readDrift, readSkillTreesAtTag, fetch };
};

const behindOne = (
  name = "workflow-commit",
  current = "v0.2.0",
  latest = "v0.3.0",
): OutdatedResult => ({ ok: true, behind: [{ name, current, latest }] });

const run = (options: Parameters<typeof build>[0]) =>
  build(options).readDrift.execute({
    target: { kind: "repo", repoPath: "/repo" },
  });

describe("ReadDrift", () => {
  it("reads a skill with an identical tree at both tags as older-tag", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1", tdd: "t9" }),
      },
    });

    expect(result).toEqual({
      ok: true,
      behind: [
        {
          name: "workflow-commit",
          current: "v0.2.0",
          latest: "v0.3.0",
          reading: "older-tag",
        },
      ],
    });
  });

  it("reads a skill whose tree moved between the two tags as behind", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t2" }),
      },
    });

    expect(result).toEqual({
      ok: true,
      behind: [
        {
          name: "workflow-commit",
          current: "v0.2.0",
          latest: "v0.3.0",
          reading: "behind",
        },
      ],
    });
  });

  it("reads a skill proven absent from the latest release as no longer released", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ tdd: "t9" }),
      },
    });

    expect(result).toMatchObject({
      behind: [{ reading: "no-longer-released" }],
    });
  });

  it("reads the old name as no longer released after a clean rename", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit-renamed": "t1" }),
      },
    });

    expect(result).toMatchObject({
      behind: [{ reading: "no-longer-released" }],
    });
  });

  it("does not guess intent when a renamed skill's content also changed", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit-renamed": "t2" }),
      },
    });

    expect(result).toMatchObject({
      behind: [{ reading: "no-longer-released" }],
    });
  });

  it("falls back to behind when the deployed name cannot be proven at its pin", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ tdd: "t1" }),
        "v0.3.0": trees({}),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("falls back to behind when the latest release tree is unreadable", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": null,
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("reads a pin naming another repository as behind", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([
        { name: "workflow-commit", ref: "v0.2.0", repoUrl: "someone/else" },
      ]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("reads a skill as behind when no harness clone is connected", async () => {
    const result = await run({
      outdated: behindOne(),
      root: undefined,
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("reads a skill as behind when the clone origin cannot be read", async () => {
    const result = await run({
      outdated: behindOne(),
      origin: null,
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("reads a skill as behind when the pinned tag is unreadable in the clone", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": null,
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("reads a skill as behind when the lockfile holds no pin for it", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: null,
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("reads a name pinned twice as behind", async () => {
    const result = await run({
      outdated: behindOne(),
      lock: lockfile([
        { name: "workflow-commit", ref: "v0.2.0" },
        { name: "workflow-commit", ref: "v0.1.0" },
      ]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  describe("a root-package target", () => {
    const rootLock = (skills: string[], repoUrl = "fimoklei/harness") =>
      `dependencies:\n- repo_url: ${repoUrl}\n  host: github.com\n  resolved_ref: v0.2.0\n  package_type: apm_package\n  deployed_files:\n${skills
        .flatMap((name) => [
          `  - .claude/skills/${name}`,
          `  - .claude/skills/${name}/SKILL.md`,
          `  - .agents/skills/${name}/SKILL.md`,
        ])
        .join("\n")}\n`;
    const packageBehind = behindOne("harness");
    const packageEntry = {
      name: "harness",
      current: "v0.2.0",
      latest: "v0.3.0",
      reading: "behind",
    };

    it("reads each selected skill against the latest release", async () => {
      const result = await run({
        outdated: packageBehind,
        lock: rootLock(["release-notes", "code-review", "commit-message"]),
        refs: {
          "v0.2.0": trees({
            "release-notes": "t1",
            "code-review": "t2",
            "commit-message": "t3",
          }),
          "v0.3.0": trees({
            "code-review": "t4",
            "commit-message": "t3",
            "test-plan": "t5",
          }),
        },
      });

      expect(result).toEqual({
        ok: true,
        behind: [
          packageEntry,
          {
            ...packageEntry,
            name: "release-notes",
            reading: "no-longer-released",
          },
          { ...packageEntry, name: "code-review", reading: "behind" },
        ],
      });
    });

    it("gives no reading to a selected skill absent from both releases", async () => {
      const result = await run({
        outdated: packageBehind,
        lock: rootLock(["release-notes"]),
        refs: { "v0.2.0": trees({}), "v0.3.0": trees({}) },
      });

      expect(result).toEqual({ ok: true, behind: [packageEntry] });
    });

    it("gives no skill a reading when a release cannot be read", async () => {
      const result = await run({
        outdated: packageBehind,
        lock: rootLock(["release-notes"]),
        refs: { "v0.2.0": trees({ "release-notes": "t1" }), "v0.3.0": null },
      });

      expect(result).toEqual({ ok: true, behind: [packageEntry] });
    });

    it("gives no skill a reading for a package from another repository", async () => {
      const result = await run({
        outdated: packageBehind,
        lock: rootLock(["release-notes"], "someone/harness"),
        refs: {
          "v0.2.0": trees({ "release-notes": "t1" }),
          "v0.3.0": trees({}),
        },
      });

      expect(result).toEqual({ ok: true, behind: [packageEntry] });
    });
  });

  it("forwards a failed check unchanged", async () => {
    const result = await run({
      outdated: { ok: false, reason: "unverified" },
    });

    expect(result).toEqual({ ok: false, reason: "unverified" });
  });

  it("forwards a timed-out check unchanged", async () => {
    const result = await run({
      outdated: { ok: false, reason: "timed-out" },
    });

    expect(result).toEqual({ ok: false, reason: "timed-out" });
  });

  it("reads no trees when apm reports nothing behind", async () => {
    const { readDrift, readSkillTreesAtTag, fetch } = build({
      outdated: { ok: true, behind: [] },
    });

    await expect(
      readDrift.execute({ target: { kind: "repo", repoPath: "/repo" } }),
    ).resolves.toEqual({ ok: true, behind: [] });
    expect(readSkillTreesAtTag).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches tags before reading trees, and once per check", async () => {
    const { readDrift, fetch, readSkillTreesAtTag } = build({
      outdated: {
        ok: true,
        behind: [
          { name: "workflow-commit", current: "v0.2.0", latest: "v0.3.0" },
          { name: "tdd", current: "v0.2.0", latest: "v0.3.0" },
        ],
      },
      lock: lockfile([
        { name: "workflow-commit", ref: "v0.2.0" },
        { name: "tdd", ref: "v0.2.0" },
      ]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1", tdd: "t2" }),
        "v0.3.0": trees({ "workflow-commit": "t1", tdd: "t3" }),
      },
    });

    const result = await readDrift.execute({
      target: { kind: "repo", repoPath: "/repo" },
    });

    expect(result).toMatchObject({
      behind: [{ reading: "older-tag" }, { reading: "behind" }],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    // One ls-tree per ref, not per skill.
    expect(readSkillTreesAtTag).toHaveBeenCalledTimes(2);
  });

  it("reads a skill as behind when the latest cell is not a version tag", async () => {
    const result = await run({
      outdated: behindOne("workflow-commit", "v0.2.0", "unknown"),
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        unknown: trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "behind" }] });
  });

  it("keeps a failed fetch from blocking the content read", async () => {
    const result = await run({
      outdated: behindOne(),
      fetch: async () => {
        throw new Error("no network");
      },
      lock: lockfile([{ name: "workflow-commit", ref: "v0.2.0" }]),
      refs: {
        "v0.2.0": trees({ "workflow-commit": "t1" }),
        "v0.3.0": trees({ "workflow-commit": "t1" }),
      },
    });

    expect(result).toMatchObject({ behind: [{ reading: "older-tag" }] });
  });
});
