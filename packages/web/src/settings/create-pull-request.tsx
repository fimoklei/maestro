import type { PullRequestRef } from "@maestro/core";
import {
  PULL_REQUEST_NOT_OPENED,
  pullRequestNotice,
} from "../categories/pull-request-copy";
import {
  useCategoriesProposalPreview,
  useCreatePullRequest,
} from "../categories/use-categories";
import { CreatePullRequestDialog } from "./create-pull-request-dialog";

// The Create pull request dialog's reads and write, mounted only while it
// stands, so each opening compares afresh.
export function CreatePullRequest({
  onCreated,
  onClose,
}: {
  onCreated: (pullRequest: PullRequestRef) => void;
  onClose: () => void;
}) {
  const preview = useCategoriesProposalPreview();
  const create = useCreatePullRequest();
  const failure = preview.isError
    ? pullRequestNotice(preview.error)
    : create.isError
      ? pullRequestNotice(create.error)
      : create.data?.pullRequest.state === "missing"
        ? PULL_REQUEST_NOT_OPENED
        : null;
  return (
    <CreatePullRequestDialog
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
