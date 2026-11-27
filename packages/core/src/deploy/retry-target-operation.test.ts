import { describe, expect, it } from "vitest";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import { copiesIn } from "./deployed-content.fake";
import { InFlightLocks } from "./in-flight-locks";
import { RetryTargetOperation } from "./retry-target-operation";
import { selectionWorld } from "./selection-writer-fake";

type RetryOutcomes = ConstructorParameters<
  typeof RetryTargetOperation
>[0]["outcomes"];

const HARNESS = "fimoklei/agent-harness";
const target: DeployTarget = { kind: "repo", repoPath: "/repo" };

const silentFolders: RetryOutcomes = {
  read: async ({ release }) => ({ release, places: [] }),
};

function buildUseCase({
  state = "clean",
  readLockfile,
  outcomes = silentFolders,
}: {
  state?: DeployedContentState;
  readLockfile?: () => Promise<never>;
  outcomes?: RetryOutcomes;
} = {}) {
  const world = selectionWorld();
  const content = copiesIn(state).content;
  const retry = new RetryTargetOperation({
    registry: { isRegistered: async () => true },
    selection: world.writer,
    deployedCleanup: world.cleanup,
    deployedContent:
      readLockfile === undefined ? content : { ...content, readLockfile },
    toolPresence: { detectGlobalTools: async () => ["claude" as const] },
    canonicalPath: async (path: string) => path,
    locks: new InFlightLocks(),
    outcomes,
  });
  return { world, retry };
}

const interrupted = {
  key: "/repo",
  target,
  harness: HARNESS,
  kind: "deploy" as const,
  release: "v0.6.0",
  previous: ["prototype"],
  desired: ["prototype", "review"],
  tools: null,
};

const interruptedGlobal = {
  ...interrupted,
  key: "global",
  target: { kind: "global" } as const,
  tools: ["claude" as const, "codex" as const],
};

function globalFolders(missing: {
  claude: readonly string[];
  codex: readonly string[];
}): RetryOutcomes {
  const readings = (names: readonly string[], gone: readonly string[]) =>
    names.map((name) => ({
      name,
      reading: gone.includes(name)
        ? ("missing" as const)
        : ("at-release" as const),
    }));
  return {
    read: async ({ release, names }) => ({
      release,
      places: [
        {
          tool: "claude",
          path: "~/.claude/skills",
          detected: true,
          skills: readings(names, missing.claude),
        },
        {
          tool: "codex",
          path: "~/.agents/skills",
          detected: true,
          skills: readings(names, missing.codex),
        },
      ],
    }),
  };
}

describe("RetryTargetOperation", () => {
  it("has nothing to offer on a target with no unfinished operation", async () => {
    const { retry } = buildUseCase();
    expect(await retry.pending(target)).toBeNull();
  });

  it("names the operation, its release and its desired selection", async () => {
    const { world, retry } = buildUseCase();
    await world.operations.begin(interrupted);

    expect(await retry.pending(target)).toEqual({
      kind: "deploy",
      release: "v0.6.0",
      desired: ["prototype", "review"],
    });
  });

  it("reruns the saved release and selection, not the newest one", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);

    expect(await retry.execute({ target })).toEqual({
      ok: true,
      completed: {
        kind: "deploy",
        release: "v0.6.0",
        desired: ["prototype", "review"],
      },
      report: { release: "v0.6.0", places: [] },
      landed: [],
    });
    expect(world.calls).toEqual([
      {
        command: "install",
        target,
        ref: `github.com/${HARNESS}#v0.6.0`,
        skills: ["prototype", "review"],
      },
    ]);
  });

  it("discards a consented edited copy an Update dropped, and finishes", async () => {
    const { world, retry } = buildUseCase({ state: "diverged" });
    world.seed({ release: "v0.6.0", skills: ["prototype", "review"] });
    world.edits("claude", "review");
    await world.operations.begin({
      ...interrupted,
      kind: "update",
      release: "v0.7.0",
      previous: ["prototype", "review"],
      desired: ["prototype"],
    });
    const refused = await retry.execute({ target });
    expect(refused.ok ? null : refused.error).toBe(
      "deployed-diverged-from-lock",
    );
    expect(world.files.has("/target/.claude/skills/review/SKILL.md")).toBe(
      true,
    );

    const result = await retry.execute({
      target,
      confirmedCopyReceipt: refused.ok ? undefined : refused.copyReceipt,
    });

    expect(result).toMatchObject({ ok: true });
    expect(world.files.has("/target/.claude/skills/review/SKILL.md")).toBe(
      false,
    );
    expect(await world.operations.read("/repo")).toBeNull();
  });

  it("clears the operation once the retry converged", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);

    await retry.execute({ target });

    expect(await world.operations.read("/repo")).toBeNull();
  });

  it("reports a timed-out retry and keeps the operation", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);
    world.refuseWith({ ok: false, reason: "timed-out" });

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "retry-timed-out",
    });
    expect(await world.operations.read("/repo")).not.toBeNull();
  });

  it("keeps the operation when the retry still did not converge", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);
    world.landsOnly(["prototype"]);

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "retry-incomplete",
    });
    expect(await world.operations.read("/repo")).not.toBeNull();
  });

  it("stays unfinished while one tool's copy is missing, and converges once it lands", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);
    world.skipsCopy("claude", "review");

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "retry-incomplete",
    });
    expect(await world.operations.read("/repo")).not.toBeNull();

    expect(await retry.execute({ target })).toMatchObject({ ok: true });
    expect(await world.operations.read("/repo")).toBeNull();
    expect(world.calls.map((call) => call.ref)).toEqual([
      `github.com/${HARNESS}#v0.6.0`,
      `github.com/${HARNESS}#v0.6.0`,
    ]);
  });

  it("states each skill a completed Global retry finished as written in every Global folder", async () => {
    const { world, retry } = buildUseCase({
      outcomes: globalFolders({ claude: [], codex: [] }),
    });
    await world.operations.begin(interruptedGlobal);

    const result = await retry.execute({ target: { kind: "global" } });

    const written = [
      { name: "prototype", state: "written" },
      { name: "review", state: "written" },
    ];
    expect(result).toMatchObject({
      ok: true,
      report: {
        release: "v0.6.0",
        places: [
          { path: "~/.claude/skills", skills: written },
          { path: "~/.agents/skills", skills: written },
        ],
      },
      landed: ["prototype", "review"],
    });
  });

  it("names as landed only the skills the retry wrote in every Global folder", async () => {
    const { world, retry } = buildUseCase({
      outcomes: globalFolders({ claude: [], codex: ["review"] }),
    });
    await world.operations.begin(interruptedGlobal);

    expect(await retry.execute({ target: { kind: "global" } })).toMatchObject({
      ok: true,
      landed: ["prototype"],
    });
  });

  it("finishes a Global removal over its saved tools while another folder keeps the removed skill", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    await world.operations.begin({
      ...interrupted,
      key: "global",
      target: { kind: "global" },
      kind: "remove",
      previous: ["caveman", "prototype"],
      desired: ["prototype"],
      tools: ["claude"],
    });

    expect(await retry.execute({ target: { kind: "global" } })).toMatchObject({
      ok: true,
    });
    expect(world.calls[0]?.tools).toEqual(["claude"]);
    expect(world.files.has("/target/.agents/skills/caveman/SKILL.md")).toBe(
      true,
    );
    expect(await world.operations.read("global")).toBeNull();
  });

  it("refuses when there is nothing to retry", async () => {
    const { retry } = buildUseCase();
    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "nothing-to-retry",
    });
  });

  it("refuses a copy edited since the interruption, and offers its own receipt", async () => {
    const { world, retry } = buildUseCase({ state: "diverged" });
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);

    const result = await retry.execute({ target });

    expect(result).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
      copyReceipt: expect.any(String),
    });
    expect(world.calls).toEqual([]);
  });

  it("runs once the reader consents to the copy the retry just read", async () => {
    const { world, retry } = buildUseCase({ state: "diverged" });
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);
    const refused = await retry.execute({ target });

    const result = await retry.execute({
      target,
      confirmedCopyReceipt:
        refused.ok === false ? (refused.copyReceipt ?? "") : "",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("offers no consent past an unreadable copy", async () => {
    const { world, retry } = buildUseCase({ state: "unreadable" });
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
  });

  it("reruns an interrupted update at the release the reader chose", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.5.0", skills: ["prototype", "review"] });
    await world.operations.begin({
      ...interrupted,
      kind: "update",
      release: "v0.6.0",
      previous: ["prototype", "review"],
      desired: ["prototype", "review"],
    });

    expect(await retry.execute({ target })).toEqual({
      ok: true,
      completed: {
        kind: "update",
        release: "v0.6.0",
        desired: ["prototype", "review"],
      },
      report: { release: "v0.6.0", places: [] },
      landed: [],
    });
    expect(world.calls).toEqual([
      {
        command: "install",
        target,
        ref: `github.com/${HARNESS}#v0.6.0`,
        skills: ["prototype", "review"],
      },
    ]);
  });

  it("answers a failed retry with no word of the error it caught", async () => {
    const { world, retry } = buildUseCase({
      readLockfile: async () => {
        throw new Error("apm exited 1: token ghp_secret");
      },
    });
    await world.operations.begin(interrupted);

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "retry-failed",
    });
  });

  it("refuses an unregistered repository before reading anything", async () => {
    const world = selectionWorld();
    const retry = new RetryTargetOperation({
      registry: { isRegistered: async () => false },
      selection: world.writer,
      deployedCleanup: world.cleanup,
      deployedContent: copiesIn("clean").content,
      toolPresence: { detectGlobalTools: async () => ["claude" as const] },
      canonicalPath: async (path: string) => path,
      locks: new InFlightLocks(),
      outcomes: { read: async ({ release }) => ({ release, places: [] }) },
    });

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "repo-not-registered",
    });
  });
});
