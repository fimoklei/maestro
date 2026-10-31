import type { PendingRelease, PrimitiveRef } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { plainText } from "../ui/phrase";
import { pendingReleaseLine } from "./pending-release-copy";

const waiting = (
  change: NonNullable<PendingRelease>["change"],
  renamedTo: string | null = null,
) => ({ change, renamedTo, defaultBranch: "main" });

const line = (ref: PrimitiveRef, pending: ReturnType<typeof waiting>) =>
  plainText(pendingReleaseLine(ref, pending));

describe("the pending release sentence", () => {
  it.each([
    ["prompt", "pr-review"],
    ["skill", "tdd"],
  ] as const)(
    "asks for a release of a %s's change and deletion",
    (type, name) => {
      expect(line({ type, name }, waiting("edit"))).toBe(
        "Select Create a release on the Harness screen to publish the change.",
      );
      expect(line({ type, name }, waiting("deletion"))).toBe(
        "Select Create a release on the Harness screen to publish the deletion.",
      );
    },
  );

  it("names a prompt's new name in the next release", () => {
    expect(
      line(
        { type: "prompt", name: "pr-review" },
        waiting("rename", "pr-check"),
      ),
    ).toBe(
      "This prompt was renamed to pr-check in the next release. Select Create a release on the Harness screen to publish it.",
    );
  });

  it("names a skill's new name in the next release", () => {
    expect(
      line({ type: "skill", name: "tdd" }, waiting("rename", "test-first")),
    ).toBe(
      "This skill was renamed to test-first in the next release. Select Create a release on the Harness screen to publish it.",
    );
  });
});
