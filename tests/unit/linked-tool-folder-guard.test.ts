import type { DeployTarget } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, HOME } from "../helpers/deploy-world";

const REPO = "/work/app";
const repo: DeployTarget = { kind: "repo", repoPath: REPO };
const global: DeployTarget = { kind: "global" };

const cases = [
  { label: "a consuming repo", target: repo, folder: `${REPO}/.claude/skills` },
  { label: "Global", target: global, folder: `${HOME}/.claude/skills` },
] as const;

async function deployedWorld(target: DeployTarget) {
  const w = deployWorld({ released: ["tdd", "grill"] });
  await w.register(REPO);
  const deployed = await w.post("/api/deploy", {
    type: "skill",
    name: "tdd",
    target,
  });
  expect(deployed.status).toBe(200);
  const linkToolFolder = (folder: string) => {
    w.disk.remove(folder);
    w.disk.makeDir("/elsewhere/skills");
    w.disk.symlink(folder, "/elsewhere/skills");
  };
  const writes = () => w.installs.length + w.uninstalls.length;
  return { ...w, linkToolFolder, writes };
}

const refusal = (folder: string) => ({
  error: "destination-symlinked",
  linked: { kind: "tool-folder", path: folder },
});

describe.each(cases)("a linked tool folder in $label", ({ target, folder }) => {
  it("refuses Deploy before apm runs, naming the folder", async () => {
    const w = await deployedWorld(target);
    w.linkToolFolder(folder);
    const before = w.writes();

    const res = await w.post("/api/deploy", {
      type: "skill",
      name: "grill",
      target,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(refusal(folder));
    expect(w.writes()).toBe(before);
  });

  it("refuses Update before apm runs, naming the folder", async () => {
    const w = await deployedWorld(target);
    w.linkToolFolder(folder);
    const before = w.writes();

    const res = await w.post("/api/deploy/update/preflight", { target });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(refusal(folder));
    expect(w.writes()).toBe(before);
  });

  it("refuses an Update confirm once the folder became a link", async () => {
    const w = await deployedWorld(target);
    const preflight = await w.post("/api/deploy/update/preflight", { target });
    const { preview } = (await preflight.json()) as {
      preview: { token: string };
    };
    w.linkToolFolder(folder);
    const before = w.writes();

    const res = await w.post("/api/deploy/update", {
      target,
      token: preview.token,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(refusal(folder));
    expect(w.writes()).toBe(before);
  });

  it("refuses Remove before apm runs, naming the folder", async () => {
    const w = await deployedWorld(target);
    w.linkToolFolder(folder);
    const before = w.writes();

    const res = await w.post("/api/deploy/remove", {
      type: "skill",
      name: "tdd",
      target,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject(refusal(folder));
    expect(w.writes()).toBe(before);
  });

  it("shows no refusal before a Remove is confirmed", async () => {
    const w = await deployedWorld(target);
    w.linkToolFolder(folder);

    const res = await w.post("/api/deploy/remove/preflight", {
      type: "skill",
      name: "tdd",
      target,
    });

    expect(res.status).toBe(200);
  });

  it("refuses Retry before apm runs, naming the folder", async () => {
    const w = await deployedWorld(target);
    w.answers.installRefusal = { ok: false, reason: "failed" };
    const failed = await w.post("/api/deploy", {
      type: "skill",
      name: "grill",
      target,
    });
    expect(failed.status).toBe(502);
    w.answers.installRefusal = null;
    w.linkToolFolder(folder);
    const before = w.writes();

    const res = await w.post("/api/deploy/retry", { target });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(refusal(folder));
    expect(w.writes()).toBe(before);
  });
});
