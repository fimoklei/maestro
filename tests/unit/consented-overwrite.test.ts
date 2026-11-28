import type {
  BulkDeployReport,
  DeployTarget,
  WriteReport,
} from "@maestro/core";
import { describe, expect, it, vi } from "vitest";
import { deployWorld, HOME } from "../helpers/deploy-world";

const REPO = "/work/app";
const repoTarget: DeployTarget = { kind: "repo", repoPath: REPO };
const COPY = `${REPO}/.claude/skills/tdd/SKILL.md`;
const RELEASED = "---\nname: tdd\ndescription: tdd skill\n---\n";
const EDITED = "# tdd, edited\n";

async function world() {
  const w = deployWorld({ released: ["tdd"] });
  w.answers.releasedFiles = "as-installed";
  await w.register(REPO);
  const deploy = (body: Record<string, unknown> = {}) =>
    w.post("/api/deploy", {
      type: "skill",
      name: "tdd",
      target: repoTarget,
      ...body,
    });
  const deployedThenEdited = async () => {
    expect((await deploy()).status).toBe(200);
    w.disk.write(COPY, EDITED);
  };
  const receipt = async () =>
    ((await (await deploy()).json()) as { copyReceipt: string }).copyReceipt;
  const toolFolder = (tool: ".claude" | ".agents") =>
    w.disk.listNames(`${REPO}/${tool}`);
  const copy = () => w.disk.read(COPY)?.toString("utf8");
  return { ...w, deploy, deployedThenEdited, receipt, toolFolder, copy };
}

describe("a consented overwrite of an edited copy", () => {
  for (const editedCopies of ["kept", "refused"] as const) {
    it(`resets the copy to the release when apm ${editedCopies} an edited file`, async () => {
      const w = await world();
      await w.deployedThenEdited();
      w.answers.editedCopies = editedCopies;

      const res = await w.deploy({ confirmedCopyReceipt: await w.receipt() });

      expect(res.status).toBe(200);
      const { report } = (await res.json()) as { report: WriteReport };
      expect(
        report.places.flatMap((place) =>
          place.skills.map((skill) => [place.tool, skill.name, skill.state]),
        ),
      ).toEqual([
        ["claude", "tdd", "written"],
        ["codex", "tdd", "written"],
      ]);
      expect(w.copy()).toBe(RELEASED);
      expect(await w.toolFolder(".claude")).toEqual(["skills"]);
    });
  }

  it("puts the edited copy back byte for byte when the install fails", async () => {
    const w = await world();
    await w.deployedThenEdited();
    w.answers.installRefusal = { ok: false, reason: "failed" };

    const res = await w.deploy({ confirmedCopyReceipt: await w.receipt() });

    expect(res.status).not.toBe(200);
    expect(w.copy()).toBe(EDITED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
    expect(await w.toolFolder(".agents")).toEqual(["skills"]);
  });

  it("puts the edited copy back when the read-back says it was not updated", async () => {
    const w = await world();
    await w.deployedThenEdited();
    w.answers.releasedFiles = { "SKILL.md": "sha256:0000" };

    await w.deploy({ confirmedCopyReceipt: await w.receipt() });

    expect(w.copy()).toBe(EDITED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
  });

  it("puts the edited copy back when the read-back cannot read the release", async () => {
    const w = await world();
    await w.deployedThenEdited();
    const receipt = await w.receipt();
    w.answers.releasedFiles = null;

    await w.deploy({ confirmedCopyReceipt: receipt });

    expect(w.copy()).toBe(EDITED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
  });
});

describe("Deploy again in bulk", () => {
  it("resets the copy its receipt names and leaves a copy outside it as it was", async () => {
    const w = deployWorld({ released: ["tdd", "docs"] });
    w.answers.releasedFiles = "as-installed";
    await w.register(REPO);
    const docs = `${REPO}/.claude/skills/docs/SKILL.md`;
    expect(
      (
        await w.post("/api/deploy", {
          type: "skill",
          name: "tdd",
          target: repoTarget,
        })
      ).status,
    ).toBe(200);
    w.disk.write(COPY, EDITED);
    w.disk.write(docs, "hand-written\n");
    const bulk = await w.post("/api/deploy/bulk", {
      names: ["tdd", "docs"],
      target: repoTarget,
    });
    const { attention } = (await bulk.json()) as BulkDeployReport;
    const tdd = attention.find((row) => row.name === "tdd");

    const res = await w.post("/api/deploy/again", {
      target: repoTarget,
      held: [{ name: "tdd", confirmedCopyReceipt: tdd?.copyReceipt }],
    });

    expect(res.status).toBe(200);
    const report = (await res.json()) as BulkDeployReport;
    expect(report.deployed).toEqual([{ name: "tdd", version: "v0.5.1" }]);
    expect(w.disk.read(COPY)?.toString("utf8")).toBe(RELEASED);
    expect(w.disk.read(docs)?.toString("utf8")).toBe("hand-written\n");
    expect(await w.disk.listNames(`${REPO}/.claude`)).toEqual(["skills"]);
  });
});

describe("Discard local edits in the Update preview", () => {
  it("resets the edited Global copy to the newer release", async () => {
    const w = deployWorld({ released: ["tdd"] });
    w.answers.releasedFiles = "as-installed";
    const skill = (body = "") => `${RELEASED}${body}`;
    w.harness.tags = [
      { name: "v0.5.1", commit: w.harness.commit("v0.5.1", { tdd: skill() }) },
      {
        name: "v0.6.0",
        commit: w.harness.commit("v0.6.0", { tdd: skill("changed\n") }),
      },
    ];
    const global = { kind: "global" } as const;
    expect(
      (await w.post("/api/deploy/bulk", { names: ["tdd"], target: global }))
        .status,
    ).toBe(200);
    const copy = `${HOME}/.claude/skills/tdd/SKILL.md`;
    w.disk.write(copy, EDITED);
    const priced = await w.post("/api/deploy/update/preflight", {
      target: global,
    });
    const { preview } = (await priced.json()) as {
      preview: {
        token: string;
        copyReceipt: string;
        localEdits: { discard: unknown[] };
      };
    };
    expect(preview.localEdits.discard).toEqual([
      { name: "tdd", tool: "claude" },
    ]);

    const res = await w.post("/api/deploy/update", {
      target: global,
      token: preview.token,
      confirmedCopyReceipt: preview.copyReceipt,
    });

    expect(res.status).toBe(200);
    const { report } = (await res.json()) as { report: WriteReport };
    expect(
      report.places.map((place) => [place.tool, place.skills[0]?.state]),
    ).toEqual([
      ["claude", "written"],
      ["codex", "written"],
    ]);
    expect(w.disk.read(copy)?.toString("utf8")).toBe(RELEASED);
    expect(await w.disk.listNames(`${HOME}/.claude`)).toEqual(["skills"]);
  });
});

describe("Retry of an Unfinished operation", () => {
  it("resets an edited copy on the receipt its refusal minted", async () => {
    const w = await world();
    await w.deployedThenEdited();
    w.answers.lands = (skills, tool) => (tool === "codex" ? [] : skills);
    await w.deploy({ confirmedCopyReceipt: await w.receipt() });
    w.answers.lands = (skills) => skills;
    w.disk.write(COPY, EDITED);
    const refused = await w.post("/api/deploy/retry", { target: repoTarget });
    expect(refused.status).toBe(409);
    const { copyReceipt } = (await refused.json()) as { copyReceipt: string };

    const res = await w.post("/api/deploy/retry", {
      target: repoTarget,
      confirmedCopyReceipt: copyReceipt,
    });

    expect(res.status).toBe(200);
    expect(w.copy()).toBe(RELEASED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
  });

  async function interrupted() {
    const before = await world();
    await before.deployedThenEdited();
    const receipt = await before.receipt();
    before.answers.installHold = new Promise(() => {});
    void before.deploy({ confirmedCopyReceipt: receipt });
    await vi.waitFor(() => expect(before.installs).toHaveLength(2));
    const after = deployWorld({ released: ["tdd"], disk: before.disk });
    after.answers.releasedFiles = "as-installed";
    const retry = (body: Record<string, unknown> = {}) =>
      after.post("/api/deploy/retry", { target: repoTarget, ...body });
    return {
      ...after,
      retry,
      copy: before.copy,
      toolFolder: before.toolFolder,
    };
  }

  it("puts the set-aside copy back when the interrupted install never wrote it", async () => {
    const w = await interrupted();
    expect(w.copy()).toBeUndefined();

    const refused = await w.retry();

    expect(refused.status).toBe(409);
    expect(w.copy()).toBe(EDITED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
    const { copyReceipt } = (await refused.json()) as { copyReceipt: string };
    expect((await w.retry({ confirmedCopyReceipt: copyReceipt })).status).toBe(
      200,
    );
    expect(w.copy()).toBe(RELEASED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
  });

  it("deletes the set-aside copy when the interrupted install wrote the release", async () => {
    const w = await interrupted();
    w.disk.write(COPY, RELEASED);

    const res = await w.retry();

    expect(res.status).toBe(200);
    expect(w.copy()).toBe(RELEASED);
    expect(await w.toolFolder(".claude")).toEqual(["skills"]);
  });
});
