// Merged prompt changes wait in Pending release, and a release carries them:
// the composition over the in-memory Harness.
import {
  type ApmDriverPort,
  composeUseCases,
  type HarnessStageRow,
  type ReleasePlan,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryPorts, unreachable } from "../helpers/in-memory-app";
import { stubReview } from "../helpers/stub-review";

const HARNESS = "/harness";
const REPO = "/work/app";

type Content = Record<string, string>;

const RELEASED_SKILLS: Content = { tdd: "tdd as released" };
const RELEASED_PROMPTS: Content = {
  "pr-review": "Review $ARGUMENTS\n",
  "fix-ci": "Fix the build\n",
  stale: "Old advice\n",
};

// The latest release, v1.0.0, then one merged commit on main. The clone
// already holds that commit, so nothing waits for a proposal.
const world = (merged: { skills?: Content; prompts?: Content }) => {
  const harness = new InMemoryHarnessGit();
  harness.commit("released", RELEASED_SKILLS, { prompts: RELEASED_PROMPTS });
  harness.tags = [{ name: "v1.0.0", commit: "released" }];
  const skills = merged.skills ?? RELEASED_SKILLS;
  const prompts = merged.prompts ?? RELEASED_PROMPTS;
  harness.commit("merged", skills, {
    parent: "released",
    author: "teammate",
    prompts,
  });
  harness.tip = "merged";
  harness.head = "merged";
  harness.working = { ...skills };
  harness.workingPrompts = { ...prompts };
  const fs = new InMemoryFileSystem({
    directories: { [HARNESS]: HARNESS, [REPO]: REPO },
    files: {
      [`${REPO}/.git`]: "gitdir: elsewhere",
      // The target holds tdd at the latest release.
      [`${REPO}/apm.lock.yaml`]:
        "lockfile_version: '1'\ndependencies:\n- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_ref: v1.0.0\n  virtual_path: .apm/skills/tdd\n  package_type: claude_skill\n",
    },
  });
  const useCases = composeUseCases(
    inMemoryPorts({
      env: {
        HOME: "/home",
        MAESTRO_HOME: "/maestro-home",
        MAESTRO_INVENTORY_PATH: HARNESS,
      },
      fs,
      git: { harness },
      gh: stubReview(),
      // apm sees only that a newer tag exists; Maestro reads the content.
      apm: unreachable<ApmDriverPort>("apm", {
        checkOutdated: async () => ({
          ok: true,
          behind: [{ name: "tdd", current: "v1.0.0", latest: "v1.0.1" }],
        }),
      }),
    }),
  );
  return { harness, useCases };
};

const releaseRows = async (useCases: ReturnType<typeof world>["useCases"]) => {
  // A refresh fetches first: only a confirmed fetch gives the tags meaning.
  const read = await useCases.harness.refresh();
  if (!read.ok || read.state.stages.release.outcome !== "read") {
    throw new Error("unread Pending release");
  }
  return read.state.stages.release.rows.map((row: HarnessStageRow) => ({
    type: row.type,
    name: row.name,
    change: row.change,
    previousName: row.previousName,
  }));
};

const planOf = async (
  useCases: ReturnType<typeof world>["useCases"],
): Promise<ReleasePlan> => {
  await useCases.harness.refresh();
  const planned = await useCases.harness.planRelease();
  if (!planned.ok) {
    throw new Error(`no plan: ${planned.error}`);
  }
  return planned.plan;
};

const PATCH_REASON = "No skill was added, deleted or renamed.";

describe("merged prompt changes in Pending release", () => {
  it("lists prompt additions, edits, renames and deletions beside a skill edit", async () => {
    const { useCases } = world({
      skills: { tdd: "tdd edited" },
      prompts: {
        "pr-review": "Review $ARGUMENTS twice\n",
        "fix-build": "Fix the build\n",
        "write-adr": "Draft an ADR\n",
      },
    });

    const rows = await releaseRows(useCases);

    expect(rows).toEqual(
      expect.arrayContaining([
        { type: "skill", name: "tdd", change: "edit", previousName: null },
        {
          type: "prompt",
          name: "pr-review",
          change: "edit",
          previousName: null,
        },
        {
          type: "prompt",
          name: "fix-build",
          change: "rename",
          previousName: "fix-ci",
        },
        {
          type: "prompt",
          name: "write-adr",
          change: "addition",
          previousName: null,
        },
        {
          type: "prompt",
          name: "stale",
          change: "deletion",
          previousName: null,
        },
      ]),
    );
    expect(rows).toHaveLength(5);
  });

  it("never reads a skill deleted and a prompt added under one name as a rename", async () => {
    const { useCases } = world({
      skills: {},
      prompts: { ...RELEASED_PROMPTS, tdd: "tdd as released" },
    });

    expect(await releaseRows(useCases)).toEqual(
      expect.arrayContaining([
        { type: "skill", name: "tdd", change: "deletion", previousName: null },
        { type: "prompt", name: "tdd", change: "addition", previousName: null },
      ]),
    );
    expect(await releaseRows(useCases)).toHaveLength(2);
  });
});

describe("releasing prompt changes", () => {
  it.each([
    [
      "an edit",
      { ...RELEASED_PROMPTS, "pr-review": "Review $ARGUMENTS twice\n" },
    ],
    ["an addition", { ...RELEASED_PROMPTS, "write-adr": "Draft an ADR\n" }],
    [
      "a rename",
      {
        "pr-review": RELEASED_PROMPTS["pr-review"] ?? "",
        "fix-build": "Fix the build\n",
        stale: RELEASED_PROMPTS.stale ?? "",
      },
    ],
    [
      "a deletion",
      {
        "pr-review": RELEASED_PROMPTS["pr-review"] ?? "",
        "fix-ci": RELEASED_PROMPTS["fix-ci"] ?? "",
      },
    ],
  ])("proposes a patch for %s", async (_, prompts) => {
    const { useCases } = world({ prompts });

    const plan = await planOf(useCases);

    expect(plan.proposedStep).toBe("patch");
    expect(plan.reason).toBe(PATCH_REASON);
    expect(plan.versions.patch).toBe("v1.0.1");
  });

  it("lets a skill deletion win over a prompt change in a mixed release", async () => {
    const { useCases } = world({
      skills: {},
      prompts: { ...RELEASED_PROMPTS, "write-adr": "Draft an ADR\n" },
    });

    const plan = await planOf(useCases);

    expect(plan.proposedStep).toBe("major");
    expect(plan.reason).toBe("A skill was deleted or renamed.");
  });

  it("publishes a release that holds only prompt changes", async () => {
    const { harness, useCases } = world({
      prompts: { ...RELEASED_PROMPTS, "write-adr": "Draft an ADR\n" },
    });
    const plan = await planOf(useCases);

    const published = await useCases.publish.execute({
      step: plan.proposedStep,
      previousTag: plan.previousTag,
      previousTagCommit: plan.previousTagCommit,
      revision: plan.revision,
    });

    expect(published).toEqual({ ok: true, tag: "v1.0.1", revision: "merged" });
    expect(harness.published).toEqual([
      { name: "v1.0.1", commit: "merged", branch: "main" },
    ]);
  });

  it("leaves a target that holds the previous release Up to date after a prompt-only release", async () => {
    const { useCases } = world({
      prompts: { ...RELEASED_PROMPTS, "write-adr": "Draft an ADR\n" },
    });
    const plan = await planOf(useCases);
    await useCases.publish.execute({
      step: plan.proposedStep,
      previousTag: plan.previousTag,
      previousTagCommit: plan.previousTagCommit,
      revision: plan.revision,
    });
    await useCases.registry.register(REPO);

    const drift = await useCases.drift.execute({
      target: { kind: "repo", repoPath: REPO },
    });

    // older-tag is the Up to date reading: the skill's content never moved.
    expect(drift).toEqual({
      ok: true,
      behind: [
        {
          name: "tdd",
          current: "v1.0.0",
          latest: "v1.0.1",
          reading: "older-tag",
        },
      ],
    });
  });
});
