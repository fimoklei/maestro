import {
  mkdir,
  mkdtemp,
  realpath as nodeRealpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReleasedSkill } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { nodeApp } from "../helpers/node-app";

describe("inventory HTTP route", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await nodeRealpath(
      await mkdtemp(join(tmpdir(), "maestro-inventory-")),
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const skillManifest = (name: string, description: string) =>
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

  async function writeSkill(name: string, description: string) {
    const skillDir = join(dir, ".apm", "skills", name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
      "utf8",
    );
  }

  // Null is an unreadable release; the skills on disk are never its source.
  function makeApp(
    inventoryPath: string | undefined,
    {
      originUrl = null,
      released = [],
    }: { originUrl?: string | null; released?: ReleasedSkill[] | null } = {},
  ) {
    // The release lives in git tags; the working tree is never its source.
    const harness = new InMemoryHarnessGit();
    harness.root = dir;
    if (released === null) {
      harness.tags = null;
    } else {
      harness.commit(
        "released",
        Object.fromEntries(released.map((s) => [s.name, s.manifest])),
      );
      harness.tags = [{ name: "v1.0.0", commit: "released" }];
    }
    return nodeApp(
      {
        HOME: dir,
        MAESTRO_HOME: dir,
        ...(inventoryPath === undefined
          ? {}
          : { MAESTRO_INVENTORY_PATH: inventoryPath }),
      },
      { git: { harness, originUrl: async () => originUrl } },
    );
  }

  it("GET /api/inventory/primitives lists the released skills", async () => {
    const app = makeApp(dir, {
      released: [
        {
          name: "tdd",
          manifest: skillManifest("tdd", "Test-driven development loop"),
        },
      ],
    });

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
          path: ".apm/skills/tdd",
        },
      ],
    });
  });

  it("skips a skill with no frontmatter without hiding the valid ones", async () => {
    const app = makeApp(dir, {
      released: [
        { name: "broken", manifest: "# broken\nno frontmatter\n" },
        {
          name: "tdd",
          manifest: skillManifest("tdd", "Test-driven development loop"),
        },
      ],
    });

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
          path: ".apm/skills/tdd",
        },
      ],
    });
  });

  it("returns 409 with its own code when no inventory is configured", async () => {
    const app = makeApp(undefined);

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not-configured");
    // The path is never echoed back: it may be a misconfigured secret.
    expect(JSON.stringify(body)).not.toContain(dir);
  });

  it("returns 503 with its own code when the release cannot be read", async () => {
    const app = makeApp(dir, { released: null });

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unreadable");
    expect(JSON.stringify(body)).not.toContain(dir);
  });

  // Local disk content alone no longer justifies a positive count (#841).
  it("lists nothing when a skill is only in the working tree", async () => {
    await writeSkill("tdd", "Test-driven development loop");
    const app = makeApp(dir, { released: [] });

    const res = await app.request("/api/inventory/primitives");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ primitives: [] });
  });

  it("GET /api/inventory/config returns the local clone and GitHub repository", async () => {
    const app = makeApp(dir, {
      originUrl: "git@github.com:fimoklei/agent-harness.git",
    });

    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: await nodeRealpath(dir),
      githubRepository: "fimoklei/agent-harness",
      github: {
        kind: "link",
        url: "https://github.com/fimoklei/agent-harness",
      },
    });
  });

  it("GET /api/inventory/config keeps the local clone when its GitHub repository is not read", async () => {
    const app = makeApp(dir);

    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: await nodeRealpath(dir),
      githubRepository: null,
    });
  });

  it("GET /api/inventory/config returns null when no inventory is configured", async () => {
    const app = makeApp(undefined);

    const res = await app.request("/api/inventory/config");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inventoryPath: null,
      githubRepository: null,
    });
  });
});
