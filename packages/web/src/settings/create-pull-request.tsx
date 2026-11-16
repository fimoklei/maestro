import {
  PULL_REQUEST_NOT_OPENED,
  type PullRequestMode,
  pullRequestName,
  pullRequestNotice,
} from "../categories/pull-request-copy";
import {
  useCategoriesProposalPreview,
  useCreatePullRequest,
} from "../categories/use-categories";
import { useWriteAction } from "../ui/use-write-action";
import { CreatePullRequestDialog } from "./create-pull-request-dialog";

// The Create or Update pull request dialog's reads and write, mounted only
// while it stands, so each opening compares afresh. The row stays in view, so
// the page's region says the done sentence.
export function CreatePullRequest({
  mode,
  update,
  closed: closedRow,
  report,
  onClose,
}: {
  mode: PullRequestMode;
  /** The operator's open pull request; null to create one. */
  update: number | null;
  /** The closed pull request the row states; null for none. */
  closed: number | null;
  /** The page's one status region. */
  report: (write: string) => void;
  onClose: () => void;
}) {
  const preview = useCategoriesProposalPreview();
  const create = useCreatePullRequest();
  // The fresh read's number wins over the row's.
  const closed =
    preview.data?.kind === "after-close" ? preview.data.number : closedRow;
  const write = useWriteAction(create, {
    report,
    show: "region",
    action: mode,
    // A branch GitHub opened no pull request for keeps the dialog's notice.
    subject: ({ pullRequest }) =>
      pullRequest.state === "missing"
        ? null
        : { name: pullRequestName(pullRequest.number), row: null },
    failure: (error) => pullRequestNotice(error, mode, closed),
  });
  const failure = preview.isError
    ? pullRequestNotice(preview.error, mode, closed)
    : (write.failure ??
      (create.data?.pullRequest.state === "missing"
        ? PULL_REQUEST_NOT_OPENED
        : null));
  return (
    <CreatePullRequestDialog
      update={update}
      closed={closedRow}
      preview={preview.data ?? null}
      failure={failure}
      running={write.phase === "running"}
      onCreate={() => {
        if (preview.data === undefined) return;
        write.run(preview.data.kind, {
          onSuccess: ({ pullRequest }) => {
            if (pullRequest.state !== "missing") onClose();
          },
        });
      }}
      onClose={() => {
        if (write.phase !== "running") onClose();
      }}
    />
  );
}
