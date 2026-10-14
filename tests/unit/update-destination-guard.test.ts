// The redeploy journey through the composition's destination guard, across
// the confirm-and-proceed cells server-deploy.test.ts does not chain (#66, #952).
import { createHash } from "node:crypto";
import type { DeployTarget } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, lockfilePath } from "../helpers/deploy-world";

const REPO = "/work/app";
const target: DeployTarget = { kind: "repo", repoPath: REPO };
const LOCKFILE = lockfilePath(target);
const COPY = `${REPO}/.claude/skills/tdd/SKILL.md`;
const LATEST_TAG = "v0.5.1";

const sha = (contents: string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

async function world() {
  const w = deployWorld({ released: ["tdd"] });
  await w.register(REPO);
  const update = async (consent?: string) => {
    const res = await w.post("/api/deploy", {
      type: "skill",
      name: "tdd",
      target,
      ...(consent === undefined ? {} : { confirmedCopyReceipt: consent }),
    });
    return {
      status: res.status,
      body: (await res.json()) as { copyReceipt?: string },
    };
  };
  const recorded = () => w.disk.read(LOCKFILE)?.toString() ?? "";
  // A pre-0.20.0 lockfile: no deployed_file_hashes, so no baseline to verify.
  const dropHashes = () =>
    w.disk.write(
      LOCKFILE,
      recorded().replace(/ {2}deployed_file_hashes:\n( {4}.*\n)+/, ""),
    );
  return { ...w, update, recorded, dropHashes };
}

describe("update journey against the destination guard", () => {
  it("updates a clean deployed copy, the guard letting it proceed", async () => {
    const w = await world();
    expect((await w.update()).status).toBe(200);

    expect(await w.update()).toEqual({
      status: 200,
      body: { deployed: { type: "skill", name: "tdd", version: LATEST_TAG } },
    });
  });

  it("passes a copy that no longer matches its record but equals the release", async () => {
    // The copy on disk equals the release about to be installed: nothing is
    // at risk, so nothing is asked (#952).
    const w = await world();
    await w.update();
    const atRelease = "---\nname: tdd\n---\nreleased\n";
    w.disk.write(COPY, atRelease);
    w.disk.write(`${REPO}/.agents/skills/tdd/SKILL.md`, atRelease);
    w.answers.releasedFiles = { "SKILL.md": sha(atRelease) };

    expect(await w.update()).toEqual({
      status: 200,
      body: { deployed: { type: "skill", name: "tdd", version: LATEST_TAG } },
    });
  });

  it("refuses a receipt minted before the copy changed again", async () => {
    // The consent retires with the content it named; a fresh receipt follows (#952).
    const w = await world();
    await w.update();
    w.disk.write(COPY, "edited locally\n");
    const withHashes = w.recorded();
    w.dropHashes();
    const stale = await w.update();
    expect(stale.body).toMatchObject({ error: "deployed-unverifiable" });

    w.disk.write(LOCKFILE, withHashes);

    expect(await w.update(stale.body.copyReceipt)).toEqual({
      status: 409,
      body: {
        error: "deployed-diverged-from-lock",
        copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it("refuses an unreadable deployed copy even with consent, installing nothing", async () => {
    // No consent is on offer: an overwrite of an unreadable copy is never
    // an informed choice (#59, #952).
    const w = await world();
    await w.update();
    w.installs.length = 0;
    w.disk.setUnreadable(`${REPO}/.claude/skills/tdd`);

    expect(await w.update("a".repeat(64))).toEqual({
      status: 409,
      body: { error: "deployed-unreadable" },
    });
    expect(w.installs).toEqual([]);
  });

  it("self-heals an unverified copy: consent once, then it verifies clean", async () => {
    // The consented reinstall records the missing hashes, so the next update
    // verifies clean and proceeds unasked.
    const w = await world();
    await w.update();
    w.dropHashes();

    const refusal = await w.update();
    expect(refusal).toMatchObject({
      status: 409,
      body: { error: "deployed-unverifiable" },
    });
    expect((await w.update(refusal.body.copyReceipt)).status).toBe(200);
    expect(await w.update()).toEqual({
      status: 200,
      body: { deployed: { type: "skill", name: "tdd", version: LATEST_TAG } },
    });
  });
});
