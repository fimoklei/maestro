// Deleting, restoring and discarding a prompt: the composition over the
// in-memory Harness and one in-memory disk.
import {
  composeUseCases,
  type HarnessStageRead,
  type HarnessStageRow,
} from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../../packages/core/src/filesystem/copy-tree-fs.fake";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { inMemoryPorts } from "../helpers/in-memory-app";
import { stubReview } from "../helpers/stub-review";

const HARNESS = "/harness";
const PROMPTS = "/harness/.maestro/prompts";
const FILE = `${PROMPTS}/pr-review.md`;
const PROMPT = { type: "prompt", name: "pr-review" } as const;

// One released commit everywhere, the prompt file on disk beside one skill.
const world = () => {
  const harness = new InMemoryHarnessGit().settled(
    { tdd: "tdd as released" },
    "released",
    { "pr-review": "Review $ARGUMENTS\n" },
  );
  const disk = new InMemoryCopyTree();
  disk.write(`${HARNESS}/.apm/skills/tdd/SKILL.md`, "tdd as released");
  disk.write(FILE, "Review $ARGUMENTS\n");
  const review = stubReview();
  const useCases = composeUseCases(
    inMemoryPorts({
      env: {
        HOME: "/home",
        MAESTRO_HOME: "/maestro-home",
        MAESTRO_INVENTORY_PATH: HARNESS,
      },
      fs: disk.fileSystem(),
      copyTree: disk,
      git: { harness },
      gh: review,
    }),
  );
  return { harness, disk, review, useCases };
};

const rowsOf = (stage: HarnessStageRead): HarnessStageRow[] =>
  stage.outcome === "read" ? stage.rows : [];

const proposalRow = async (
  useCases: ReturnType<typeof world>["useCases"],
): Promise<HarnessStageRow> => {
  const read = await useCases.harness.execute();
  const row = read.ok
    ? rowsOf(read.state.stages.proposal).find(
        (each) => each.type === "prompt" && each.name === PROMPT.name,
      )
    : undefined;
  if (row === undefined) {
    throw new Error("no Pending proposal row for the prompt");
  }
  return row;
};

const workingCheck = async (useCases: ReturnType<typeof world>["useCases"]) => {
  const inspected = await useCases.deleteLocal.inspect();
  const check = inspected.ok ? inspected.checks.prompt[PROMPT.name] : undefined;
  if (check?.inClone !== true) {
    throw new Error("the prompt is not in the clone");
  }
  return check;
};

describe("deleting a prompt", () => {
  it("names the prompt file in the clone for the deletion dialog", async () => {
    const { useCases } = world();

    await expect(workingCheck(useCases)).resolves.toMatchObject({
      path: ".maestro/prompts/pr-review.md",
      uncommitted: false,
      localOnly: false,
    });
  });

  it("removes only the prompt file from disk", async () => {
    const { disk, useCases } = world();
    const check = await workingCheck(useCases);

    await expect(
      useCases.deleteLocal.execute(PROMPT, check.workingTree),
    ).resolves.toEqual({ ok: true, name: "pr-review" });

    expect(disk.filePaths()).toEqual([`${HARNESS}/.apm/skills/tdd/SKILL.md`]);
  });

  it("refuses a symlinked prompt before removing anything", async () => {
    const { disk, useCases } = world();
    disk.remove(FILE);
    disk.write("/elsewhere/notes.md", "not the Harness\n");
    disk.symlink(FILE, "/elsewhere/notes.md");
    const check = await workingCheck(useCases);

    await expect(
      useCases.deleteLocal.execute(PROMPT, check.workingTree),
    ).resolves.toEqual({ ok: false, error: "destination-unsafe" });

    expect(disk.read("/elsewhere/notes.md")?.toString()).toBe(
      "not the Harness\n",
    );
  });

  it("proposes the deletion on maestro/prompt.<name> with a body that names no targets", async () => {
    const { harness, review, useCases } = world();
    harness.workingPrompts = {};
    const row = await proposalRow(useCases);
    expect(row.change).toBe("deletion");

    await expect(
      useCases.promoteDeletion.execute(PROMPT, row.remoteTree ?? ""),
    ).resolves.toMatchObject({ ok: true, branch: "maestro/prompt.pr-review" });

    expect(harness.pushed).toEqual([
      expect.objectContaining({
        type: "prompt",
        name: "pr-review",
        kind: "deletion",
      }),
    ]);
    expect(review.created).toEqual([
      expect.objectContaining({
        head: "maestro/prompt.pr-review",
        title: "Delete prompt: pr-review",
        body: "Deletes pr-review from the Harness.",
      }),
    ]);
  });

  it("keeps the skill deletion body that names the targets", async () => {
    const { harness, review, useCases } = world();
    harness.working = {};
    const read = await useCases.harness.execute();
    const row = read.ok
      ? rowsOf(read.state.stages.proposal).find((each) => each.name === "tdd")
      : undefined;

    await useCases.promoteDeletion.execute(
      { type: "skill", name: "tdd" },
      row?.remoteTree ?? "",
    );

    expect(review.created.map((request) => request.body)).toEqual([
      "Deletes tdd from the Harness. Targets keep the skill until each one runs Update target after the next release.",
    ]);
  });
});

describe("restoring a prompt", () => {
  it("puts a locally deleted prompt file back from the last local commit", async () => {
    const { harness, disk, useCases } = world();
    harness.workingPrompts = {};
    disk.remove(FILE);

    await expect(useCases.restore.execute(PROMPT, "released")).resolves.toEqual(
      { ok: true, name: "pr-review", commit: "released" },
    );

    expect(harness.written).toEqual([
      expect.objectContaining({
        type: "prompt",
        name: "pr-review",
        commit: "released",
      }),
    ]);
  });

  it("refuses a prompts folder that links out of the Harness before writing", async () => {
    const { harness, disk, useCases } = world();
    harness.workingPrompts = {};
    disk.remove(PROMPTS);
    disk.write("/elsewhere/prompts/keep.md", "keep\n");
    disk.symlink(PROMPTS, "/elsewhere/prompts");

    await expect(useCases.restore.execute(PROMPT, "released")).resolves.toEqual(
      { ok: false, error: "destination-unsafe" },
    );

    expect(harness.written).toEqual([]);
  });
});

describe("discarding a prompt edit", () => {
  it("replaces an unproposed prompt edit with the default-branch copy", async () => {
    const { harness, disk, useCases } = world();
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };
    disk.write(FILE, "Review $ARGUMENTS twice\n");
    const row = await proposalRow(useCases);

    await expect(
      useCases.discard.execute(PROMPT, row.remoteTree ?? ""),
    ).resolves.toEqual({ ok: true, name: "pr-review" });

    expect(harness.written).toEqual([
      expect.objectContaining({
        type: "prompt",
        name: "pr-review",
        commit: "released",
      }),
    ]);
  });

  it("refuses a symlinked prompt before replacing anything", async () => {
    const { harness, disk, useCases } = world();
    harness.workingPrompts = { "pr-review": "Review $ARGUMENTS twice\n" };
    disk.remove(FILE);
    disk.write("/elsewhere/notes.md", "not the Harness\n");
    disk.symlink(FILE, "/elsewhere/notes.md");
    const row = await proposalRow(useCases);

    await expect(
      useCases.discard.execute(PROMPT, row.remoteTree ?? ""),
    ).resolves.toEqual({ ok: false, error: "destination-unsafe" });

    expect(harness.written).toEqual([]);
    expect(disk.read("/elsewhere/notes.md")?.toString()).toBe(
      "not the Harness\n",
    );
  });
});
