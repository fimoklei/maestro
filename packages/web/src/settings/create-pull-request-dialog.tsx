import type {
  CategoriesDifference,
  CategoriesProposalPreview,
  CategoryCount,
} from "@maestro/core";
import { useId } from "react";
import { NO_ITEMS } from "../categories/categories-copy";
import {
  ADDED_TO_HARNESS,
  ADDED_TO_PULL_REQUEST,
  COMPARED_WITH_NEXT_RELEASE,
  COMPARING,
  CREATE_PULL_REQUEST,
  CREATE_PULL_REQUEST_BODY,
  comparingWithPullRequest,
  createAfterCloseBody,
  DELETED_FROM_HARNESS,
  DELETED_FROM_PULL_REQUEST,
  groupLegend,
  itemsCounted,
  MOVED_TO_ANOTHER_CATEGORY,
  NEXT_RELEASE_UNREADABLE,
  notYetInPullRequest,
  PULL_REQUEST_UNREADABLE,
  pullRequestDeletes,
  SAME_AS_NEXT_RELEASE,
  SAME_AS_PULL_REQUEST,
  UPDATE_PULL_REQUEST,
  updatePullRequestBody,
  updatePullRequestTitle,
} from "../categories/pull-request-copy";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList, type GroupedListGroup } from "../ui/grouped-list";
import { Notice, type NoticeContent } from "../ui/notice";
import { StatusLine } from "../ui/status-line";

type Changes = Extract<CategoriesDifference, { kind: "changes" }>;

const categoryRows = (counts: readonly CategoryCount[]) =>
  counts.map(({ name, skills, prompts }) => ({
    key: name,
    name,
    sentence: itemsCounted(skills, prompts) ?? NO_ITEMS,
  }));

const groupsOf = (
  { added, deleted, moved }: Changes,
  legends: { added: string; deleted: string },
): GroupedListGroup[] => [
  {
    tone: "neutral",
    legend: groupLegend(legends.added, added.length),
    rows: categoryRows(added),
  },
  {
    tone: "attention",
    legend: groupLegend(legends.deleted, deleted.length),
    rows: categoryRows(deleted),
  },
  {
    tone: "neutral",
    legend: groupLegend(MOVED_TO_ANOTHER_CATEGORY, moved.length),
    rows: moved.map((item) => ({
      key: [item.type, item.name].join("/"),
      name: item.name,
      sentence: item.category ?? NO_CATEGORY,
    })),
  },
];

// What the dialog compares with: the next release for Create pull request,
// the open pull request's file for Update pull request.
const textsFor = (update: number | null) =>
  update === null
    ? {
        title: CREATE_PULL_REQUEST,
        action: CREATE_PULL_REQUEST,
        verb: "create" as const,
        body: CREATE_PULL_REQUEST_BODY,
        comparing: COMPARING,
        compared: COMPARED_WITH_NEXT_RELEASE,
        legends: { added: ADDED_TO_HARNESS, deleted: DELETED_FROM_HARNESS },
        same: SAME_AS_NEXT_RELEASE,
        unreadable: NEXT_RELEASE_UNREADABLE,
      }
    : {
        title: updatePullRequestTitle(update),
        action: UPDATE_PULL_REQUEST,
        verb: "update" as const,
        body: updatePullRequestBody(update),
        comparing: comparingWithPullRequest(update),
        compared: notYetInPullRequest(update),
        legends: {
          added: ADDED_TO_PULL_REQUEST,
          deleted: DELETED_FROM_PULL_REQUEST,
        },
        same: SAME_AS_PULL_REQUEST,
        unreadable: PULL_REQUEST_UNREADABLE,
      };

// Proposes the operator's list to the Harness (#1910), also after a close
// without merging (#1913), or sends it to the open pull request (#1912):
// what the write does, then its difference. The
// host reads the difference and owns the write.
export function CreatePullRequestDialog({
  update,
  closed,
  preview,
  failure,
  running,
  onCreate,
  onClose,
}: {
  /** The operator's open pull request; null to create one. */
  update: number | null;
  /** The closed pull request a new one replaces; null for none. */
  closed: number | null;
  /** Null while the difference is read. */
  preview: CategoriesProposalPreview | null;
  /** Why the difference could not be read or the write failed. */
  failure: NoticeContent | null;
  running: boolean;
  onCreate: () => void;
  onClose: () => void;
}) {
  const bodyId = useId();
  const texts = textsFor(update);
  const difference =
    preview?.kind === "update" || preview?.kind === "after-close"
      ? preview.difference
      : preview;
  // After a close, the body waits for the commit-author check.
  const body =
    closed === null
      ? texts.body
      : preview?.kind === "after-close"
        ? createAfterCloseBody(preview.number, preview.deletesBranch)
        : null;
  // The warning always counts against the next release.
  const deleted =
    preview?.kind === "update"
      ? preview.deleted
      : preview?.kind === "changes"
        ? preview.deleted
        : [];
  const creatable =
    failure === null &&
    (difference?.kind === "changes" || difference?.kind === "uncompared");
  const deletes = deleted.length > 0 ? pullRequestDeletes(deleted) : null;
  // A read that failed leaves nothing to describe.
  const bodyless = preview === null && failure !== null;

  return (
    <Dialog
      title={texts.title}
      version={null}
      width={480}
      {...dialogRun({
        source: creatable
          ? {
              label: texts.action,
              verb: texts.verb,
              tone: deletes === null ? "primary" : "danger",
              unavailable: null,
              onRun: onCreate,
            }
          : null,
        running,
        outcome: !creatable && (preview !== null || failure !== null),
      })}
      failure={failure}
      describedBy={
        difference?.kind === "unchanged" || body === null ? null : bodyId
      }
      fieldsChanged={false}
      onClose={onClose}
    >
      {bodyless ? null : (
        <div className="flex flex-col gap-panel">
          {difference?.kind === "unchanged" ? (
            <Notice trigger="load" notice={texts.same} />
          ) : body === null ? null : (
            <p id={bodyId} className="m-0 text-gray-11">
              {body}
            </p>
          )}
          {preview === null ? <StatusLine>{texts.comparing}</StatusLine> : null}
          {difference?.kind === "uncompared" ? (
            <Notice trigger="load" notice={texts.unreadable} />
          ) : null}
          {difference?.kind === "changes" ? (
            <>
              <p className="m-0 font-ui text-gray-11 text-meta">
                {texts.compared}
              </p>
              <GroupedList
                groups={groupsOf(difference, texts.legends)}
                checklist={null}
                live={null}
              />
            </>
          ) : null}
          {deletes === null || difference?.kind === "unchanged" ? null : (
            <Notice trigger="load" notice={deletes} />
          )}
        </div>
      )}
    </Dialog>
  );
}
