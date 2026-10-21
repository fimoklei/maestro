// Prompts on the Inventory read: the composition over the in-memory Harness.
import { composeUseCases, type InventoryPrompt } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryPorts } from "../helpers/in-memory-app";

const HARNESS = "/harness";

const skillManifest = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

// One release tag over one commit; the working clone holds nothing else.
const inventoryOver = (
  skills: Record<string, string | null>,
  prompts: Record<string, string>,
) => {
  const harness = new InMemoryHarnessGit();
  harness.commit("released", skills, { prompts });
  harness.tags = [{ name: "v1.0.0", commit: "released" }];
  return composeUseCases(
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
};

const promptsOf = async (
  inventory: ReturnType<typeof inventoryOver>,
): Promise<InventoryPrompt[]> => {
  const result = await inventory.read();
  if (!result.ok) {
    throw new Error(`unread inventory: ${result.error}`);
  }
  return result.primitives.filter(
    (primitive): primitive is InventoryPrompt => primitive.type === "prompt",
  );
};

describe("released prompts on the Inventory read", () => {
  it("lists a released prompt with its description, path and text after the frontmatter", async () => {
    const inventory = inventoryOver(
      {},
      {
        "pr-review": `---\ndescription: Review a pull request\n---\nReview [PR LINK] for $ARGUMENTS.\nFocus on $1.\n`,
      },
    );

    await expect(promptsOf(inventory)).resolves.toEqual([
      {
        type: "prompt",
        name: "pr-review",
        description: "Review a pull request",
        path: ".maestro/prompts/pr-review.md",
        pendingRelease: null,
        text: "Review [PR LINK] for $ARGUMENTS.\nFocus on $1.\n",
        nameValid: true,
      },
    ]);
  });

  it("copies the whole file when no frontmatter block closes", async () => {
    const unclosed = "---\ndescription: never closed\nBody for $ARGUMENTS\n";
    const inventory = inventoryOver({}, { plain: "Just text, $1\n", unclosed });

    const prompts = await promptsOf(inventory);

    expect(
      prompts.map(({ name, text, description }) => ({
        name,
        text,
        description,
      })),
    ).toEqual([
      { name: "plain", text: "Just text, $1\n", description: "" },
      { name: "unclosed", text: unclosed, description: "" },
    ]);
  });

  it("reads a prompt saved with Windows line endings, keeping its body byte for byte", async () => {
    const inventory = inventoryOver(
      {},
      {
        windows: "---\r\ndescription: Windows prompt\r\n---\r\nRun $1.\r\n",
      },
    );

    const [prompt] = await promptsOf(inventory);

    expect(prompt).toMatchObject({
      description: "Windows prompt",
      text: "Run $1.\r\n",
    });
  });

  it("copies only the text after an empty frontmatter block", async () => {
    const inventory = inventoryOver(
      {},
      { bare: "---\n---\nJust $ARGUMENTS\n" },
    );

    const [prompt] = await promptsOf(inventory);

    expect(prompt).toMatchObject({
      description: "",
      text: "Just $ARGUMENTS\n",
    });
  });

  it("lists a prompt with broken frontmatter with an empty description and the text after the block", async () => {
    const inventory = inventoryOver(
      {},
      { broken: "---\ndescription: [unclosed\n---\nThe body\n" },
    );

    const [prompt] = await promptsOf(inventory);

    expect(prompt).toMatchObject({ description: "", text: "The body\n" });
  });

  it("keeps a badly named prompt, marked as not valid", async () => {
    const inventory = inventoryOver({}, { PR_Review: "Review it\n" });

    await expect(promptsOf(inventory)).resolves.toEqual([
      expect.objectContaining({
        name: "PR_Review",
        path: ".maestro/prompts/PR_Review.md",
        pendingRelease: null,
        text: "Review it\n",
        nameValid: false,
      }),
    ]);
  });

  it("lists a skill and a prompt that share a name as two rows", async () => {
    const inventory = inventoryOver(
      { review: skillManifest("review", "Review skill") },
      { review: "Review prompt\n" },
    );

    const result = await inventory.read();

    expect(result).toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "review",
          description: "Review skill",
          path: ".apm/skills/review",
          pendingRelease: null,
        },
        expect.objectContaining({ type: "prompt", name: "review" }),
      ],
      unreadTypes: [],
    });
  });

  it("reads a release with no prompts as zero prompts beside its skills", async () => {
    const inventory = inventoryOver(
      { tdd: skillManifest("tdd", "TDD loop") },
      {},
    );

    await expect(inventory.read()).resolves.toEqual({
      ok: true,
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "TDD loop",
          path: ".apm/skills/tdd",
          pendingRelease: null,
        },
      ],
      unreadTypes: [],
    });
  });

  it("leaves a prompt merged after the latest release off the list", async () => {
    const harness = new InMemoryHarnessGit();
    harness.commit("released", {}, { prompts: { old: "Old\n" } });
    harness.commit(
      "merged",
      {},
      { parent: "released", prompts: { old: "Old\n", fresh: "Fresh\n" } },
    );
    harness.tags = [{ name: "v1.0.0", commit: "released" }];
    harness.tip = "merged";
    harness.head = "merged";
    const inventory = composeUseCases(
      inMemoryPorts({
        env: { MAESTRO_HOME: "/maestro-home", MAESTRO_INVENTORY_PATH: HARNESS },
        fs: new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } }),
        git: { harness },
      }),
    ).inventory;

    const prompts = await promptsOf(inventory);

    expect(prompts.map(({ name }) => name)).toEqual(["old"]);
  });
});
