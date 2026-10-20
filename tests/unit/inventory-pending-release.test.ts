// A merged change that waits for a release, on the Inventory read: the
// composition over the in-memory Harness.
import { composeUseCases, type InventoryPrimitive } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryPorts } from "../helpers/in-memory-app";

const HARNESS = "/harness";

const skill = (name: string, body = "") =>
  `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n${body}`;

type Content = {
  skills?: Record<string, string>;
  prompts?: Record<string, string>;
};

// `released` is tagged v1.0.0; `merged` is the default branch tip after it.
const harnessOver = (released: Content, merged: Content) => {
  const harness = new InMemoryHarnessGit();
  harness.commit("released", released.skills ?? {}, {
    prompts: released.prompts ?? {},
  });
  harness.tags = [{ name: "v1.0.0", commit: "released" }];
  harness.commit("merged", merged.skills ?? {}, {
    parent: "released",
    prompts: merged.prompts ?? {},
  });
  harness.tip = "merged";
  harness.head = "merged";
  return harness;
};

const inventoryOf = (harness: InMemoryHarnessGit) =>
  composeUseCases(
    inMemoryPorts({
      env: {
        HOME: "/home",
        MAESTRO_HOME: "/maestro-home",
        MAESTRO_INVENTORY_PATH: HARNESS,
      },
      fs: new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } }),
      git: { harness },
    }),
  ).inventory;

const pendingOf = async (harness: InMemoryHarnessGit) => {
  const result = await inventoryOf(harness).read();
  if (!result.ok) {
    throw new Error(`unread inventory: ${result.error}`);
  }
  return result.primitives.map((primitive: InventoryPrimitive) => ({
    type: primitive.type,
    name: primitive.name,
    pendingRelease: primitive.pendingRelease,
  }));
};

describe("pending release facts on the Inventory read", () => {
  it("marks a skill and a prompt edited after the release, and nothing else", async () => {
    const harness = harnessOver(
      {
        skills: { tdd: skill("tdd"), grill: skill("grill") },
        prompts: { "pr-review": "Review it.\n", plan: "Plan it.\n" },
      },
      {
        skills: { tdd: skill("tdd", "More.\n"), grill: skill("grill") },
        prompts: { "pr-review": "Review it twice.\n", plan: "Plan it.\n" },
      },
    );

    await expect(pendingOf(harness)).resolves.toEqual([
      {
        type: "skill",
        name: "tdd",
        pendingRelease: {
          change: "edit",
          renamedTo: null,
          defaultBranch: "main",
        },
      },
      { type: "skill", name: "grill", pendingRelease: null },
      {
        type: "prompt",
        name: "pr-review",
        pendingRelease: {
          change: "edit",
          renamedTo: null,
          defaultBranch: "main",
        },
      },
      { type: "prompt", name: "plan", pendingRelease: null },
    ]);
  });

  it("keeps a prompt deleted or renamed in a merged change listed under its old name", async () => {
    const harness = harnessOver(
      { prompts: { "pr-review": "Review it.\n", plan: "Plan it.\n" } },
      { prompts: { "pr-check": "Review it.\n" } },
    );

    await expect(pendingOf(harness)).resolves.toEqual([
      {
        type: "prompt",
        name: "pr-review",
        pendingRelease: {
          change: "rename",
          renamedTo: "pr-check",
          defaultBranch: "main",
        },
      },
      {
        type: "prompt",
        name: "plan",
        pendingRelease: {
          change: "deletion",
          renamedTo: null,
          defaultBranch: "main",
        },
      },
    ]);
  });

  it("never matches a skill to a prompt change of the same name", async () => {
    const harness = harnessOver(
      { skills: { tdd: skill("tdd") }, prompts: { tdd: "Test first.\n" } },
      { skills: { tdd: skill("tdd") }, prompts: {} },
    );

    await expect(pendingOf(harness)).resolves.toEqual([
      { type: "skill", name: "tdd", pendingRelease: null },
      {
        type: "prompt",
        name: "tdd",
        pendingRelease: {
          change: "deletion",
          renamedTo: null,
          defaultBranch: "main",
        },
      },
    ]);
  });

  it("never marks a released row for a merged addition", async () => {
    const harness = harnessOver(
      { prompts: { plan: "Plan it.\n" } },
      { prompts: { plan: "Plan it.\n", extra: "New.\n" } },
    );

    await expect(pendingOf(harness)).resolves.toEqual([
      { type: "prompt", name: "plan", pendingRelease: null },
    ]);
  });

  it("lists every row without pending facts when the default branch cannot be read", async () => {
    const harness = harnessOver(
      { prompts: { plan: "Plan it.\n" } },
      { prompts: { plan: "Plan it again.\n" } },
    );
    harness.tip = null;

    await expect(pendingOf(harness)).resolves.toEqual([
      { type: "prompt", name: "plan", pendingRelease: null },
    ]);
  });
});
