import type { HarnessPrimitiveType } from "@maestro/core";
import { BRANCH_FACT } from "../ui/band-copy";
import type { NoticeContent } from "../ui/notice";
import {
  DELETION_COPY,
  deleteFromOrigin,
  deletionTitle,
  NEXT_RELEASE_COMMIT_FACT,
  NEXT_RELEASE_COMMIT_HINT,
  openRequestNotice,
  uncommittedNotice,
} from "./deletion-copy";
import { DELETION_CHECKING } from "./dialog-copy";
import { HarnessConfirmation } from "./harness-confirmation";
import { ITEM_WORDS } from "./item-words";
import type { LocalDeletionContext } from "./local-deletion-copy";

// The two roads a Harness item's deletion takes. Proposing it needs the exact
// origin/HEAD copy the confirmation is given against (#580), and the open
// request it turns into a deletion; removing it on disk needs the folder that
// goes (#798), read fresh while the dialog stands. `localOnly` picks the copy:
// a skill in no ref is gone for good, one on the default branch is step 1 of a
// proposed deletion (#1370).
export type DeletionMode =
  | {
      kind: "propose";
      origin: string;
      branch: string;
      seenRemoteTree: string;
      openRequest: { number: number; author: string } | null;
    }
  | {
      kind: "local";
      origin: string;
      screen: LocalDeletionContext["screen"];
      path: string;
      check: "checking" | "failed" | "not-in-clone" | "ready";
      localOnly: boolean;
      uncommitted: boolean;
    };

export function DeletionDialog({
  type,
  name,
  mode,
  onClose,
  onConfirm,
  deleting,
  deleteError,
}: {
  type: HarnessPrimitiveType;
  name: string;
  mode: DeletionMode;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  deleteError: NoticeContent | null;
}) {
  const copy = DELETION_COPY[type];
  const byMode =
    mode.kind === "propose"
      ? {
          // The open request's warning says what this press does instead.
          changes:
            mode.openRequest === null ? copy.proposes(mode.origin) : null,
          stays: copy.keeps(name),
          facts: [
            { label: BRANCH_FACT, value: mode.branch },
            // The whole hash: the exact origin/HEAD copy the confirmation is
            // given against (#580).
            {
              label: NEXT_RELEASE_COMMIT_FACT,
              value: mode.seenRemoteTree,
              hint: NEXT_RELEASE_COMMIT_HINT,
            },
          ],
          checking: null,
          loadNotice: openRequestNotice(type, name, mode.openRequest),
        }
      : {
          ...(mode.localOnly
            ? // No second sentence: the other modes name what keeps the
              // item, and here nothing does.
              { changes: copy.localOnly(name), stays: null, loadNotice: null }
            : {
                changes: copy.inClone(name, mode.origin),
                stays: deleteFromOrigin(mode.origin, mode.screen),
                loadNotice: mode.uncommitted
                  ? uncommittedNotice(type, name, mode.origin)
                  : null,
              }),
          facts: [{ label: ITEM_WORDS[type].Holder, value: mode.path }],
          checking: mode.check === "checking" ? DELETION_CHECKING : null,
        };
  return (
    <HarnessConfirmation
      type={type}
      name={name}
      title={deletionTitle(name)}
      action={{
        label: copy.label,
        verb: "delete",
        unavailable:
          mode.kind === "local" &&
          (mode.check === "failed" || mode.check === "not-in-clone")
            ? // The caller states a failed or empty check in `deleteError`;
              // without it the action still stays blocked.
              (deleteError?.label ?? "")
            : null,
        run: onConfirm,
      }}
      running={deleting}
      failure={deleteError}
      {...byMode}
      onClose={onClose}
    />
  );
}
