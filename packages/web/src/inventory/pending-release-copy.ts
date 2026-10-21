import type { PendingRelease, PrimitiveRef } from "@maestro/core";
import { CHANGE_WORD } from "../harness/change-words";
import { harnessRow } from "../harness/harness-route";
import { ITEM_WORDS } from "../harness/item-words";
import { STAGE_NAMES } from "../harness/stage-copy";
import { CREATE_RELEASE } from "../ui/control-labels";
import type { Fact } from "../ui/detail-pane";
import { link, machine, named, type Phrase, phrase } from "../ui/phrase";

type Pending = NonNullable<PendingRelease>;

/** Stage and Change on an Inventory pane, while a merged change waits. */
export const pendingReleaseFacts = (pending: Pending): Fact[] => [
  { label: "Stage", value: STAGE_NAMES["pending-release"] },
  { label: "Change", value: CHANGE_WORD[pending.change] },
];

/** The next step under the facts: its words link the Pending release row. */
export const pendingReleaseLine = (
  ref: PrimitiveRef,
  pending: Pending,
): Phrase => {
  // A renamed row waits in Pending release under its new name.
  const harness = link(
    "Harness screen",
    harnessRow(
      { type: ref.type, name: pending.renamedTo ?? ref.name },
      "pending-release",
    ),
  );
  const sentences: Record<Pending["change"], Phrase> = {
    edit: phrase`Select ${CREATE_RELEASE} on the ${harness} to publish the change.`,
    deletion: phrase`Select ${CREATE_RELEASE} on the ${harness} to publish the deletion.`,
    rename: phrase`This ${ITEM_WORDS[ref.type].noun} was renamed to ${named(pending.renamedTo ?? ref.name)} on ${machine(pending.defaultBranch)}. Select ${CREATE_RELEASE} on the ${harness} to publish it.`,
  };
  return sentences[pending.change];
};
