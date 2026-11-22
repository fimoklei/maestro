import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "./harness-git.fake";

describe("InMemoryHarnessGit", () => {
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
