import { describe, expect, it } from "vitest";
import type { DeployedContentState, DeployTarget } from "./deploy-skill";
import { InFlightLocks } from "./in-flight-locks";
import { RetryTargetOperation } from "./retry-target-operation";
import { selectionWorld } from "./selection-writer-fake";

const HARNESS = "fimoklei/agent-harness";
const target: DeployTarget = { kind: "repo", repoPath: "/repo" };

function buildUseCase(state: DeployedContentState = "clean") {
  const world = selectionWorld();
  const retry = new RetryTargetOperation({
    registry: { isRegistered: async () => true },
    selection: world.writer,
    deployedContent: {
      classify: async () => state,
      contentDigest: async () => null,
    },
    toolPresence: { detectGlobalTools: async () => ["claude" as const] },
    canonicalPath: async (path: string) => path,
    locks: new InFlightLocks(),
  });
  return { world, retry };
}

// The interrupted deploy this recovery starts from: apm ran, nothing landed,
// and the intent is on disk.
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

  it("clears the operation once the retry converged", async () => {
    const { world, retry } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);

    await retry.execute({ target });

    expect(await world.operations.read("/repo")).toBeNull();
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

  it("refuses when there is nothing to retry", async () => {
    const { retry } = buildUseCase();
    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "nothing-to-retry",
    });
  });

  it("refuses a copy edited since the interruption, and offers its own receipt", async () => {
    const { world, retry } = buildUseCase("diverged");
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
    const { world, retry } = buildUseCase("diverged");
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
    const { world, retry } = buildUseCase("unreadable");
    world.seed({ release: "v0.6.0", skills: ["prototype"] });
    await world.operations.begin(interrupted);

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "deployed-unreadable",
    });
  });

  // A release published since the preview is not the one the reader chose (#954).
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

  it("refuses an unregistered repository before reading anything", async () => {
    const world = selectionWorld();
    const retry = new RetryTargetOperation({
      registry: { isRegistered: async () => false },
      selection: world.writer,
      deployedContent: {
        classify: async () => "clean" as const,
        contentDigest: async () => null,
      },
      toolPresence: { detectGlobalTools: async () => ["claude" as const] },
      canonicalPath: async (path: string) => path,
      locks: new InFlightLocks(),
    });

    expect(await retry.execute({ target })).toEqual({
      ok: false,
      error: "repo-not-registered",
    });
  });
});
