import type { PullRequestRef } from "@maestro/core";
import {
  CREATE_PULL_REQUEST,
  PULL_REQUEST_NOT_OPENED,
  pullRequestNotice,
  UPDATE_PULL_REQUEST,
} from "../categories/pull-request-copy";
import {
  useCategoriesProposalPreview,
  useCreatePullRequest,
} from "../categories/use-categories";
import { CreatePullRequestDialog } from "./create-pull-request-dialog";

// The Create or Update pull request dialog's reads and write, mounted only
// while it stands, so each opening compares afresh.
export function CreatePullRequest({
  update,
  closed: closedRow,
  onCreated,
  onClose,
}: {
  /** The operator's open pull request; null to create one. */
  update: number | null;
  /** The closed pull request the row states; null for none. */
  closed: number | null;
  onCreated: (pullRequest: PullRequestRef) => void;
  onClose: () => void;
}) {
  const preview = useCategoriesProposalPreview();
  const create = useCreatePullRequest();
  const action = update === null ? CREATE_PULL_REQUEST : UPDATE_PULL_REQUEST;
  // The fresh read's number wins over the row's.
  const closed =
    preview.data?.kind === "after-close" ? preview.data.number : closedRow;
  const failure = preview.isError
    ? pullRequestNotice(preview.error, action, closed)
    : create.isError
      ? pullRequestNotice(create.error, action, closed)
      : create.data?.pullRequest.state === "missing"
        ? PULL_REQUEST_NOT_OPENED
        : null;
  return (
    <CreatePullRequestDialog
      update={update}
      closed={closedRow}
      preview={preview.data ?? null}
      failure={failure}
      running={create.isPending}
      onCreate={() =>
        create.mutate(undefined, {
          onSuccess: ({ pullRequest }) => {
            if (pullRequest.state !== "missing") onCreated(pullRequest);
          },
        })
      }
      onClose={() => {
        if (!create.isPending) onClose();
      }}
    />
  );
}
