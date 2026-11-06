import type { BulkDeployReport } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import { heldDeployView } from "./held-deploy-view";

const FOLDERS = [
  { path: "~/.claude/skills", tool: "claude" as const, detected: true },
  { path: "~/.agents/skills", tool: "codex" as const, detected: true },
];

// Only code-review was sent: the plan skipped commit-message, whose copy is at
// the release by version but carries local edits.
const HELD: BulkDeployReport = {
  target: { kind: "global" },
  deployed: [],
  attention: [
    {
      name: "code-review",
      error: "deployed-diverged-from-lock",
      forceable: true,
      copyReceipt: "a".repeat(64),
      blockingCopies: [
        {
          name: "commit-message",
          verdict: "local-edits",
          folders: ["~/.claude/skills"],
        },
      ],
    },
  ],
  failed: [],
};

describe("a Global deploy held whole by local edits", () => {
  it("counts a skipped skill with the edits that held the run as held", () => {
    const view = heldDeployView(HELD, FOLDERS, ["commit-message", "test-plan"]);

    expect(view?.names).toEqual(["code-review", "commit-message"]);
    expect(view?.held).toEqual([
      { name: "code-review", confirmedCopyReceipt: "a".repeat(64) },
    ]);
    expect(view?.lines.map((line) => line.fact)).toEqual([
      "0 of 2 skills deployed",
      "0 of 2 skills deployed",
    ]);
    expect(plainText(view?.notice.items?.[0] ?? "")).toBe(
      "Select Deploy again to replace those edits with the latest release and deploy both skills.",
    );
    expect(view?.notice.detail).toBeDefined();
    expect(plainText(view?.notice.detail ?? "")).toBe(
      "Global skills deploy together, so local edits to commit-message also prevented code-review from being deployed.",
    );
  });

  it("reads no hold where the run deployed a skill", () => {
    expect(
      heldDeployView(
        { ...HELD, deployed: [{ name: "tdd", version: "v1.0.0" }] },
        FOLDERS,
        [],
      ),
    ).toBeNull();
  });
});
