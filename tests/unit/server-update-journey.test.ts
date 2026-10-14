import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consumerManifest, deployWorld } from "../helpers/deploy-world";

// The production composition over an in-memory disk and Harness, the
// Selection written through the real lifecycle behind a fake apm (#953, #954).
// A linked skill folder needs the real disk: tests/integration/update-symlinked-destination.test.ts.

const REPO = "/work/app";
const COPY = "# skill\n";

// The shape apm 0.29.0 writes for a root package, its hashes read off the copies.
const rootPackageLockfile = (ref: string, deployedFiles: string[]) =>
  [
    "lockfile_version: '1'",
    "apm_version: 0.29.0",
    "dependencies:",
    "- repo_url: fimoklei/agent-harness",
    "  name: agent-harness",
    "  host: github.com",
    `  resolved_ref: ${ref}`,
    "  package_type: apm_package",
    "  deployed_files:",
    ...deployedFiles.map((file) => `  - ${file}`),
    "  deployed_file_hashes:",
    ...deployedFiles.map(
      (file) =>
        `    ${file}: sha256:${createHash("sha256").update(COPY).digest("hex")}`,
    ),
    "",
  ].join("\n");

// The Harness's release tags; a skill's content stands for its tree.
const RELEASES = {
  "v0.3.2": { tdd: "a", grill: "b", review: "d" },
  "v0.3.4": { tdd: "a2", grill: "b", wizard: "f" },
};

// A repo install runs for every tool; its outcome reads each copy.
const everyTool = (name: string, state: string) =>
  ["claude", "codex"].map((tool) => ({ name, tool, state }));

function makeApp() {
  const w = deployWorld({ released: ["tdd"] });
  w.harness.tags = Object.entries(RELEASES).map(([tag, skills]) => ({
    name: tag,
    commit: w.harness.commit(tag, skills),
  }));
  w.disk.write(`${REPO}/.git`, "gitdir: elsewhere");
  const register = async () => {
    const response = await w.post("/api/registry/repos", { path: REPO });
    expect(response.status).toBe(201);
  };
  const seedTarget = (names: string[]) => {
    const files = names.map((name) => `.claude/skills/${name}/SKILL.md`);
    for (const file of files) {
      w.disk.write(`${REPO}/${file}`, COPY);
    }
    w.disk.write(`${REPO}/apm.lock.yaml`, rootPackageLockfile("v0.3.2", files));
  };
  const preflight = (body: unknown) =>
    w.post("/api/deploy/update/preflight", body);
  const update = (body: unknown) => w.post("/api/deploy/update", body);
  const read = (file: string) => w.disk.read(`${REPO}/${file}`)?.toString();
  return {
    ...w,
    register,
    seedTarget,
    preflight,
    update,
    read,
  };
}

describe("update HTTP journey", () => {
  it("prices the latest release over the target's own deployed skills", async () => {
    const w = makeApp();
    w.seedTarget(["tdd", "grill", "review"]);
    await w.register();

    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      preview: Record<string, unknown>;
    };
    expect(body.preview).toMatchObject({
      release: "v0.3.2",
      chosenRelease: "v0.3.4",
      counts: { changed: 1, removed: 1, unchanged: 1 },
      changed: [
        {
          name: "tdd",
          url: "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/tdd",
        },
      ],
      removed: ["review"],
      unchanged: ["grill"],
      newInRelease: [
        {
          name: "wizard",
          url: "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/wizard",
        },
      ],
      selection: {
        current: ["tdd", "grill", "review"],
        desired: ["tdd", "grill"],
      },
      copyReceipt: null,
    });
    expect(body.preview.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names the copies needing consent and the receipt that licenses them", async () => {
    const w = makeApp();
    w.seedTarget(["tdd"]);
    w.disk.write(`${REPO}/.claude/skills/tdd/SKILL.md`, "# edited\n");
    await w.register();

    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      preview: { localEdits: unknown; copyReceipt: string };
    };
    expect(body.preview.localEdits).toStrictEqual({
      discard: [{ name: "tdd", tool: null }],
      unverified: [],
    });
    expect(body.preview.copyReceipt).toMatch(/^[0-9a-f]{64}$/);
  });

  // The Skills entrance: adding a skill the target's release lacks (#955).
  it("names the requested skill and carries it into the desired Selection", async () => {
    const w = makeApp();
    w.seedTarget(["tdd", "grill", "review"]);
    await w.register();

    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
      add: "wizard",
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      preview: Record<string, unknown>;
    };
    expect(body.preview).toMatchObject({
      addedByThisDeploy: [
        {
          name: "wizard",
          url: "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/wizard",
        },
      ],
      newInRelease: [],
      selection: {
        current: ["tdd", "grill", "review"],
        desired: ["tdd", "grill", "wizard"],
      },
    });
  });

  it("refuses to price a release that does not hold the requested skill", async () => {
    const w = makeApp();
    w.seedTarget(["tdd", "grill", "review"]);
    await w.register();

    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
      add: "review",
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toStrictEqual({
      error: "skill-not-in-release",
    });
  });

  it("refuses a repository the registry does not hold", async () => {
    const w = makeApp();
    w.seedTarget(["tdd"]);

    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: "repo-not-registered",
    });
  });

  it("refuses a target that follows no release", async () => {
    const w = makeApp();
    await w.register();

    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({ error: "not-deployed" });
  });

  async function priced(options?: {
    lands?: (skills: readonly string[]) => readonly string[];
    add?: string;
  }) {
    const w = makeApp();
    if (options?.lands !== undefined) {
      w.answers.lands = options.lands;
    }
    w.seedTarget(["tdd", "grill", "review"]);
    w.disk.write(
      `${REPO}/apm.yml`,
      consumerManifest(["grill", "review", "tdd"]),
    );
    await w.register();
    const response = await w.preflight({
      target: { kind: "repo", repoPath: REPO },
      ...(options?.add === undefined ? {} : { add: options.add }),
    });
    const body = (await response.json()) as { preview: { token: string } };
    return { ...w, token: body.preview.token };
  }

  it("moves the target to the chosen release and states what landed", async () => {
    const w = await priced();

    const response = await w.update({
      target: { kind: "repo", repoPath: REPO },
      token: w.token,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      release: "v0.3.4",
      outcome: [
        ...everyTool("tdd", "updated"),
        ...everyTool("grill", "updated"),
        ...everyTool("review", "removed"),
      ],
    });
    expect(w.read("apm.yml")).toBe(consumerManifest(["grill", "tdd"]));
    // The deploy-state reads the release the update just recorded.
    const state = await w.app.request(
      `/api/deploy-state?repo=${encodeURIComponent(REPO)}`,
    );
    expect(await state.json()).toMatchObject({
      primitives: [
        { name: "tdd", version: "v0.3.4" },
        { name: "grill", version: "v0.3.4" },
      ],
    });
  });

  it("states the skills that did not land and keeps the way out", async () => {
    const w = await priced({ lands: () => ["tdd"] });

    const response = await w.update({
      target: { kind: "repo", repoPath: REPO },
      token: w.token,
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toStrictEqual({
      error: "update-incomplete",
      outcome: [
        ...everyTool("tdd", "updated"),
        ...everyTool("grill", "missing"),
        ...everyTool("review", "removed"),
      ],
    });
  });

  it("adopts the release and adds the requested skill in one confirm", async () => {
    const w = await priced({ add: "wizard" });

    const response = await w.update({
      target: { kind: "repo", repoPath: REPO },
      token: w.token,
      add: "wizard",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      release: "v0.3.4",
      outcome: [
        ...everyTool("tdd", "updated"),
        ...everyTool("grill", "updated"),
        ...everyTool("review", "removed"),
        ...everyTool("wizard", "updated"),
      ],
    });
    expect(w.read("apm.yml")).toBe(
      consumerManifest(["grill", "tdd", "wizard"]),
    );
  });

  it("refuses a confirm naming a skill the preview never priced", async () => {
    const w = await priced();

    const response = await w.update({
      target: { kind: "repo", repoPath: REPO },
      token: w.token,
      add: "wizard",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "status-out-of-date",
    });
    expect(w.installs).toStrictEqual([]);
  });

  it("refuses a token nobody minted, leaving the target untouched", async () => {
    const w = await priced();

    const response = await w.update({
      target: { kind: "repo", repoPath: REPO },
      token: "0".repeat(64),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toStrictEqual({
      error: "status-out-of-date",
    });
    expect(w.installs).toStrictEqual([]);
  });

  it("answers a confirm with no token with the server's own request shape", async () => {
    const w = makeApp();

    const response = await w.update({
      target: { kind: "repo", repoPath: REPO },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "invalid-body",
      message:
        "Nothing was updated. Reload the page, then start the update again.",
      detail:
        "The request carries a target and the token the preview answered with.",
    });
  });

  it("answers a body naming no target with the server's own request shape", async () => {
    const w = makeApp();

    const response = await w.preflight({ repoPath: REPO });

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: "invalid-body",
      message:
        "Nothing was previewed. Reload the page, then start the update again.",
      detail:
        'The request carries a target: { kind: "repo", repoPath } or { kind: "global" }.',
    });
  });
});
