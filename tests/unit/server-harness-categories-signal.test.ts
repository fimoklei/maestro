// The change signal and the Harness categories the operator last saw, over
// HTTP: the composition over an in-memory disk and Harness.
import type { CopyPreview, HarnessCategories } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";

const HARNESS = "/harness";
const FILE = ".maestro/categories.yml";

const file = (names: string[], assignments: string[] = []) =>
  [
    "version: 1",
    `categories: [${names.join(", ")}]`,
    assignments.length === 0 ? "assignments: []" : "assignments:",
    ...assignments.map((each) => `  - ${each}`),
    "",
  ].join("\n");

const REVIEW_PLANNING = file(
  ["Review", "Planning"],
  ["{ type: skill, name: tdd, category: Planning }"],
);

const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const world = () => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
    MAESTRO_INVENTORY_PATH: HARNESS,
  };
  const fs = new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } });
  const harness = new InMemoryHarnessGit();
  const app = inMemoryApp({ env, fs, git: { harness } });
  const release = (tag: string, text: string | null) => {
    harness.commit(
      tag,
      { tdd: "# tdd\n" },
      { files: text === null ? {} : { [FILE]: text } },
    );
    harness.tags = [...(harness.tags ?? []), { name: tag, commit: tag }];
  };
  const read = async () =>
    (await (
      await app.request("/api/categories/harness")
    ).json()) as HarnessCategories;
  const changed = async () => {
    const harnessCategories = await read();
    return harnessCategories.kind === "listed"
      ? harnessCategories.changed
      : null;
  };
  const preview = async () =>
    (await (
      await app.request("/api/categories/harness/preview", post({}))
    ).json()) as CopyPreview;
  const write = async (path: string, body: unknown) => {
    expect((await app.request(path, post(body))).status).toBe(200);
  };
  const markSeen = async () => {
    const response = await app.request(
      "/api/categories/harness/seen",
      post({}),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as HarnessCategories;
  };
  return { harness, release, read, changed, preview, write, markSeen };
};

describe("the Harness categories change signal over HTTP", () => {
  it("signals an operator who never saw the Harness categories", async () => {
    const { release, read } = world();
    release("v1.5.0", REVIEW_PLANNING);

    expect(await read()).toEqual({
      kind: "listed",
      tag: "v1.5.0",
      count: 2,
      changed: true,
    } satisfies HarnessCategories);
  });

  it("clears the signal once the copy dialog opened, without a copy", async () => {
    const { release, changed, preview } = world();
    release("v1.5.0", REVIEW_PLANNING);

    await preview();

    expect(await changed()).toBe(false);
  });

  it("clears the signal once a copy ran", async () => {
    const { release, changed, write } = world();
    release("v1.5.0", REVIEW_PLANNING);

    await write("/api/categories/harness/copy", { mode: "add" });

    expect(await changed()).toBe(false);
  });

  it("clears the signal once the Connect gate offered the copy", async () => {
    const { release, changed, markSeen } = world();
    release("v1.5.0", REVIEW_PLANNING);

    expect(await markSeen()).toEqual({
      kind: "listed",
      tag: "v1.5.0",
      count: 2,
      changed: false,
    } satisfies HarnessCategories);
    expect(await changed()).toBe(false);
  });

  it.each([
    ["has no categories", null, { kind: "none" }],
    ["has a broken file", "categories: [\n", { kind: "faulty", tag: "v1.5.0" }],
  ] as const)(
    "records nothing as seen when the release %s",
    async (_, text, offered) => {
      const { release, changed, markSeen } = world();
      release("v1.5.0", text);

      expect(await markSeen()).toEqual(offered satisfies HarnessCategories);
      release("v1.6.0", REVIEW_PLANNING);

      expect(await changed()).toBe(true);
    },
  );

  it("signals a release that changed the Harness categories since the operator saw them", async () => {
    const { release, changed, preview } = world();
    release("v1.5.0", REVIEW_PLANNING);
    await preview();

    release(
      "v1.6.0",
      file(
        ["Review", "Planning"],
        ["{ type: skill, name: tdd, category: Review }"],
      ),
    );

    expect(await changed()).toBe(true);
  });

  it("raises no signal for a release that left the Harness categories alone", async () => {
    const { release, changed, preview } = world();
    release("v1.5.0", REVIEW_PLANNING);
    await preview();

    release(
      "v1.6.0",
      file(
        ["Planning", "Review"],
        ["{ type: skill, name: tdd, category: Planning }"],
      ),
    );

    expect(await changed()).toBe(false);
  });

  it.each([
    ["removed them", null],
    ["broke the file", "categories: [\n"],
  ])("keeps last seen as stored through a release that %s", async (_, text) => {
    const { release, read, changed, preview } = world();
    release("v1.5.0", REVIEW_PLANNING);
    await preview();

    release("v1.6.0", text);
    expect((await read()).kind).not.toBe("listed");
    release("v1.7.0", REVIEW_PLANNING);

    expect(await changed()).toBe(false);
  });

  it("counts a Harness list equal to the operator's own as seen, also after a later edit", async () => {
    const { release, changed, write } = world();
    release("v1.5.0", REVIEW_PLANNING);
    await write("/api/categories", { name: "Planning" });
    await write("/api/categories", { name: "Review" });
    await write("/api/categories/assign", {
      items: [{ type: "skill", name: "tdd" }],
      category: "Planning",
    });

    expect(await changed()).toBe(false);
    await write("/api/categories", { name: "Drafts" });

    expect(await changed()).toBe(false);
  });

  it("signals a Harness list that differs from the operator's own in spelling", async () => {
    const { release, changed, write } = world();
    await write("/api/categories", { name: "planning" });
    await write("/api/categories", { name: "Review" });
    release("v1.5.0", file(["Review", "Planning"]));

    expect(await changed()).toBe(true);
  });

  it("marks only the categories new since the operator last looked, once", async () => {
    const { release, preview } = world();
    release("v1.5.0", REVIEW_PLANNING);

    expect((await preview()).fresh).toEqual([]);
    release("v1.6.0", file(["Review", "Planning", "Writing"]));

    expect((await preview()).fresh).toEqual(["Writing"]);
    expect((await preview()).fresh).toEqual([]);
  });
});
