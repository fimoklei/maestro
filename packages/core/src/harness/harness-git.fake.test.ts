import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "./harness-git.fake";

describe("InMemoryHarnessGit", () => {
  // As in git: a blob and a tree of the same text never share a hash.
  it("never gives a prompt the hash of a skill tree with the same text", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("c", { tdd: "same text" }, { prompts: { tdd: "same text" } });

    const objects = await git.readPrimitives(git.root, "c");

    const [skill, prompt] = ["skill", "prompt"].map(
      (type) => objects?.find((object) => object.type === type)?.hash,
    );
    expect(skill).toBeDefined();
    expect(prompt).toBeDefined();
    expect(prompt).not.toBe(skill);
  });
});
