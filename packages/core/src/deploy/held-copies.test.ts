import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_LAYOUT } from "./global-layout.fake";
import { blockingCopies } from "./held-copies";
import type { CopyFinding } from "./local-copy-guard";

const finding = (
  name: string,
  tool: CopyFinding["tool"],
  verdict: CopyFinding["verdict"],
): CopyFinding => ({ name, tool, verdict, linkedPath: null });

describe("blockingCopies", () => {
  it("names each skill once, at its worst tool's verdict, with only that verdict's folders", () => {
    const copies = blockingCopies(
      [
        finding("tdd", "claude", "unverified"),
        finding("tdd", "codex", "local-edits"),
        finding("grill", "claude", "unverified"),
      ],
      DEFAULT_GLOBAL_LAYOUT,
    );

    expect(copies).toEqual([
      { name: "tdd", verdict: "local-edits", folders: ["~/.agents/skills"] },
      { name: "grill", verdict: "unverified", folders: ["~/.claude/skills"] },
    ]);
  });

  it("names no folder for a repository copy", () => {
    expect(
      blockingCopies(
        [finding("tdd", null, "local-edits")],
        DEFAULT_GLOBAL_LAYOUT,
      ),
    ).toEqual([{ name: "tdd", verdict: "local-edits", folders: [] }]);
  });
});
