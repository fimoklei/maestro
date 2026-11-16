// What Categories in Settings reads of the Harness categories, over HTTP: the
// composition over an in-memory disk and Harness.
import type { HarnessCategories } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";

const HARNESS = "/harness";
const FILE = ".maestro/categories.yml";

const VALID = [
  "version: 1",
  "categories: [Planning, Writing, Review]",
  "assignments:",
  "  - { type: skill, name: tdd, category: Planning }",
  "",
].join("\n");

const world = ({ connected = true }: { connected?: boolean } = {}) => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
  };
  if (connected) env.MAESTRO_INVENTORY_PATH = HARNESS;
  const fs = new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } });
  const harness = new InMemoryHarnessGit();
  const app = inMemoryApp({ env, fs, git: { harness } });
  // Tags `tag` on a commit whose tree holds `files`.
  const release = (tag: string, files: Record<string, string>) => {
    harness.commit(tag, { tdd: "# tdd\n" }, { files });
    harness.tags = [...(harness.tags ?? []), { name: tag, commit: tag }];
  };
  const read = async () => {
    const res = await app.request("/api/categories/harness");
    return { status: res.status, body: await res.json() };
  };
  return { app, harness, release, read };
};

describe("the Harness categories over HTTP", () => {
  it("counts the valid categories in the latest release", async () => {
    const { release, read } = world();
    release("v1.0.0", { [FILE]: VALID });

    expect(await read()).toEqual({
      status: 200,
      body: {
        kind: "listed",
        tag: "v1.0.0",
        count: 3,
      } satisfies HarnessCategories,
    });
  });

  it("counts only the valid categories of a file with a bad entry", async () => {
    const { release, read } = world();
    release("v1.0.0", {
      [FILE]:
        "version: 1\ncategories: [Planning, planning, '']\nassignments: []\n",
    });

    expect((await read()).body).toEqual({
      kind: "listed",
      tag: "v1.0.0",
      count: 1,
    } satisfies HarnessCategories);
  });

  it("reads the latest release, never an older one", async () => {
    const { release, read } = world();
    release("v1.0.0", { [FILE]: VALID });
    release("v1.1.0", {});

    expect((await read()).body).toEqual({
      kind: "none",
    } satisfies HarnessCategories);
  });

  it.each([
    ["a Harness without a release", {}],
    ["a release without the file", { "v1.0.0": {} }],
    [
      "a file without a valid category",
      {
        "v1.0.0": {
          [FILE]: "version: 1\ncategories: ['No category']\nassignments: []\n",
        },
      },
    ],
  ])(
    "states nothing for %s",
    async (_, releases: Record<string, Record<string, string>>) => {
      const { release, read } = world();
      for (const [tag, files] of Object.entries(releases)) release(tag, files);

      expect(await read()).toEqual({
        status: 200,
        body: { kind: "none" } satisfies HarnessCategories,
      });
    },
  );

  it.each([
    ["invalid YAML", "categories: [\n"],
    ["a wrong shape", "- Planning\n"],
    ["version 2", "version: 2\ncategories: []\nassignments: []\n"],
    [
      "over 256 KB",
      `version: 1\ncategories: []\nassignments: []\n# ${"x".repeat(256 * 1024)}\n`,
    ],
    [
      "over 200 categories",
      `version: 1\ncategories: [${Array.from({ length: 201 }, (_, at) => `C${at}`).join(", ")}]\nassignments: []\n`,
    ],
  ])("names the release whose file has %s", async (_, body) => {
    const { release, read } = world();
    release("v1.5.0", { [FILE]: body });

    expect(await read()).toEqual({
      status: 200,
      body: { kind: "faulty", tag: "v1.5.0" } satisfies HarnessCategories,
    });
  });

  it("keeps the operator's own list working beside a file with an error", async () => {
    const { app, release } = world();
    release("v1.5.0", { [FILE]: "categories: [\n" });

    const added = await app.request("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Planning" }),
    });

    expect(added.status).toBe(200);
  });

  it("states that it could not read a Harness whose tags cannot be read", async () => {
    const { harness, read } = world();
    harness.tags = null;

    expect((await read()).body).toEqual({
      kind: "unread",
    } satisfies HarnessCategories);
  });

  it("refuses the read while no Harness is connected", async () => {
    const { read } = world({ connected: false });

    expect(await read()).toEqual({
      status: 409,
      body: { error: "not-configured" },
    });
  });
});
