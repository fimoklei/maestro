import type { CategoriesProposalPreview, CategoryCount } from "@maestro/core";
import { useId } from "react";
import { NO_ITEMS } from "../categories/categories-copy";
import {
  ADDED_TO_HARNESS,
  COMPARED_WITH_NEXT_RELEASE,
  COMPARING,
  CREATE_PULL_REQUEST,
  CREATE_PULL_REQUEST_BODY,
  DELETED_FROM_HARNESS,
  groupLegend,
  itemsCounted,
  MOVED_TO_ANOTHER_CATEGORY,
  NEXT_RELEASE_UNREADABLE,
  pullRequestDeletes,
  SAME_AS_NEXT_RELEASE,
} from "../categories/pull-request-copy";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList, type GroupedListGroup } from "../ui/grouped-list";
import { Notice, type NoticeContent } from "../ui/notice";
import { StatusLine } from "../ui/status-line";

type Changes = Extract<CategoriesProposalPreview, { kind: "changes" }>;

const categoryRows = (counts: readonly CategoryCount[]) =>
  counts.map(({ name, skills, prompts }) => ({
    key: name,
    name,
    sentence: itemsCounted(skills, prompts) ?? NO_ITEMS,
  }));

const groupsOf = ({ added, deleted, moved }: Changes): GroupedListGroup[] => [
  {
    tone: "neutral",
    legend: groupLegend(ADDED_TO_HARNESS, added.length),
    rows: categoryRows(added),
  },
  {
    tone: "attention",
    legend: groupLegend(DELETED_FROM_HARNESS, deleted.length),
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

// Proposes the operator's list to the Harness (#1910): what the pull request
// does, then its difference against the next release. The host reads the
// difference and owns the write.
export function CreatePullRequestDialog({
  preview,
  failure,
  running,
  onCreate,
  onClose,
}: {
  /** Null while the difference is read. */
  preview: CategoriesProposalPreview | null;
  /** Why the difference could not be read or the pull request not created. */
  failure: NoticeContent | null;
  running: boolean;
  onCreate: () => void;
  onClose: () => void;
}) {
  const bodyId = useId();
  const creatable =
    failure === null &&
    (preview?.kind === "changes" || preview?.kind === "uncompared");
  const deletes =
    preview?.kind === "changes" && preview.deleted.length > 0
      ? pullRequestDeletes(preview.deleted)
      : null;
  // A read that failed leaves nothing to describe.
  const bodyless = preview === null && failure !== null;

  return (
    <Dialog
      title={CREATE_PULL_REQUEST}
      version={null}
      width={480}
      {...dialogRun({
        source: creatable
          ? {
              label: CREATE_PULL_REQUEST,
              verb: "create",
              tone: deletes === null ? "primary" : "danger",
              unavailable: null,
              onRun: onCreate,
            }
          : null,
        running,
        outcome: !creatable && (preview !== null || failure !== null),
      })}
      failure={failure}
      describedBy={preview?.kind === "unchanged" ? null : bodyId}
      fieldsChanged={false}
      onClose={onClose}
    >
      {bodyless ? null : (
        <div className="flex flex-col gap-panel">
          {preview?.kind === "unchanged" ? (
            <Notice trigger="load" notice={SAME_AS_NEXT_RELEASE} />
          ) : (
            <p id={bodyId} className="m-0 text-gray-11">
              {CREATE_PULL_REQUEST_BODY}
            </p>
          )}
          {preview === null ? <StatusLine>{COMPARING}</StatusLine> : null}
          {preview?.kind === "uncompared" ? (
            <Notice trigger="load" notice={NEXT_RELEASE_UNREADABLE} />
          ) : null}
          {preview?.kind === "changes" ? (
            <>
              <p className="m-0 font-ui text-gray-11 text-meta">
                {COMPARED_WITH_NEXT_RELEASE}
              </p>
              <GroupedList
                groups={groupsOf(preview)}
                checklist={null}
                live={null}
              />
            </>
          ) : null}
          {deletes === null ? null : <Notice trigger="load" notice={deletes} />}
        </div>
      )}
    </Dialog>
  );
}
