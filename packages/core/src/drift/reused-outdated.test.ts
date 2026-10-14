import { describe, expect, it } from "vitest";
import type { ApmDriverPort, DeployTarget } from "../index";
import type { OutdatedResult } from "./parse-outdated";
import { ReusedOutdated } from "./reused-outdated";

const MAX_AGE = 30_000;
const APP: DeployTarget = { kind: "repo", repoPath: "/repos/app" };
const SITE: DeployTarget = { kind: "repo", repoPath: "/repos/site" };
const GLOBAL: DeployTarget = { kind: "global" };
// A symlinked spelling of APP, as a write receives it from the request.
const APP_LINK: DeployTarget = { kind: "repo", repoPath: "/links/app" };

const BEHIND: OutdatedResult = {
  ok: true,
  behind: [{ name: "tdd", current: "v0.1.0", latest: "v0.2.0" }],
};

function build(
  answer: () => OutdatedResult = () => BEHIND,
  deploySkill: ApmDriverPort["deploySkill"] = async () => ({ ok: true }),
) {
  let now = Date.parse("2026-10-14T09:00:00.000Z");
  const runs: DeployTarget[] = [];
  let hold: Promise<void> | null = null;
  const apm: ApmDriverPort = {
    resolveLatestTag: async () => ({ ok: true, tag: "v0.2.0" }),
    deploySkill,
    removeSkill: async () => ({ ok: true }),
    checkOutdated: async (target) => {
      runs.push(target);
      await hold;
      return answer();
    },
  };
  const reused = new ReusedOutdated({
    apm,
    canonicalPath: async (path) => path.replace("/links/", "/repos/"),
    now: () => new Date(now),
    maxAgeMs: MAX_AGE,
  });
  return {
    reused,
    runs,
    advance: (ms: number) => {
      now += ms;
    },
    // The next runs wait until the returned release is called.
    holdRuns: () => {
      let release = () => {};
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

describe("ReusedOutdated", () => {
  it("reuses a Target's answer within the window", async () => {
    const { reused, runs, advance } = build();
    await reused.checkOutdated(APP);

    advance(MAX_AGE - 1);
    await expect(reused.checkOutdated(APP)).resolves.toEqual(BEHIND);

    expect(runs).toHaveLength(1);
  });

  it("asks apm again once the answer is older than the window", async () => {
    const { reused, runs, advance } = build();
    await reused.checkOutdated(APP);

    advance(MAX_AGE);
    await reused.checkOutdated(APP);

    expect(runs).toHaveLength(2);
  });

  it("answers concurrent reads of one Target with one apm run", async () => {
    const { reused, runs, holdRuns } = build();
    const release = holdRuns();

    const all = Promise.all(
      Array.from({ length: 5 }, () => reused.checkOutdated(APP)),
    );
    release();

    expect(await all).toEqual(Array.from({ length: 5 }, () => BEHIND));
    expect(runs).toHaveLength(1);
  });

  it("keeps each Target's answer apart", async () => {
    const { reused, runs } = build();
    await reused.checkOutdated(APP);

    await reused.checkOutdated(SITE);
    await reused.checkOutdated(GLOBAL);

    expect(runs).toEqual([APP, SITE, GLOBAL]);
  });

  it.each<[string, OutdatedResult]>([
    ["a failed", { ok: false }],
    ["an unverified", { ok: false, reason: "unverified" }],
    ["a timed-out", { ok: false, reason: "timed-out" }],
  ])("never reuses %s read", async (_label, failure) => {
    const { reused, runs } = build(() => failure);

    await expect(reused.checkOutdated(APP)).resolves.toEqual(failure);
    await reused.checkOutdated(APP);

    expect(runs).toHaveLength(2);
  });

  it.each<[string, (reused: ReusedOutdated) => Promise<unknown>]>([
    [
      "a deploy",
      (reused) => reused.deploySkill({ target: APP_LINK, ref: "o/r#v0.2.0" }),
    ],
    [
      "a removal",
      (reused) => reused.removeSkill({ target: APP_LINK, ref: "o/r#v0.2.0" }),
    ],
  ])("drops the written Target's answer after %s", async (_label, write) => {
    const { reused, runs } = build();
    await reused.checkOutdated(APP);
    await reused.checkOutdated(SITE);

    await write(reused);
    await reused.checkOutdated(APP);
    await reused.checkOutdated(SITE);

    expect(runs).toEqual([APP, SITE, APP]);
  });

  it("drops the answer even when the write fails", async () => {
    const { reused, runs } = build(undefined, async () => {
      throw new Error("apm crashed");
    });
    await reused.checkOutdated(GLOBAL);

    await expect(
      reused.deploySkill({ target: GLOBAL, ref: "o/r#v0.2.0" }),
    ).rejects.toThrow();
    await reused.checkOutdated(GLOBAL);

    expect(runs).toEqual([GLOBAL, GLOBAL]);
  });

  it("drops every Target's answer at once", async () => {
    const { reused, runs } = build();
    await reused.checkOutdated(APP);
    await reused.checkOutdated(GLOBAL);

    reused.dropAll();
    await reused.checkOutdated(APP);
    await reused.checkOutdated(GLOBAL);

    expect(runs).toEqual([APP, GLOBAL, APP, GLOBAL]);
  });

  it("never keeps an answer whose read began before a drop", async () => {
    const { reused, runs, holdRuns } = build();
    const release = holdRuns();
    const early = reused.checkOutdated(APP);

    reused.dropAll();
    release();
    await early;
    await reused.checkOutdated(APP);

    expect(runs).toEqual([APP, APP]);
  });
});
