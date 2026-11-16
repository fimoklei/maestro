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
  onCreated,
  onClose,
}: {
  /** The operator's open pull request; null to create one. */
  update: number | null;
  onCreated: (pullRequest: PullRequestRef) => void;
  onClose: () => void;
}) {
  const preview = useCategoriesProposalPreview();
  const create = useCreatePullRequest();
  const action = update === null ? CREATE_PULL_REQUEST : UPDATE_PULL_REQUEST;
  const failure = preview.isError
    ? pullRequestNotice(preview.error, action)
    : create.isError
      ? pullRequestNotice(create.error, action)
      : create.data?.pullRequest.state === "missing"
        ? PULL_REQUEST_NOT_OPENED
        : null;
  return (
    <CreatePullRequestDialog
      update={update}
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
