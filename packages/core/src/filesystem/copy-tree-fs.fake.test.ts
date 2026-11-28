import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "./copy-tree-fs.fake";

describe("InMemoryCopyTree.symlink", () => {
  it("refuses a link where a folder already stands, as the disk does", async () => {
    const tree = new InMemoryCopyTree();
    await tree.makeDir("/home/.claude/skills");

    expect(() => tree.symlink("/home/.claude/skills", "/elsewhere")).toThrow(
      "EEXIST",
    );
  });

  it("refuses a link where a file already stands", () => {
    const tree = new InMemoryCopyTree();
    tree.write("/home/notes.md", "x");

    expect(() => tree.symlink("/home/notes.md", "/elsewhere")).toThrow(
      "EEXIST",
    );
  });

  it("places a link where nothing stands", async () => {
    const tree = new InMemoryCopyTree();
    await tree.makeDir("/elsewhere");
    tree.symlink("/home/.claude/skills", "/elsewhere");

    await expect(tree.describe("/home/.claude/skills")).resolves.toMatchObject({
      kind: "symlink",
    });
  });
});
