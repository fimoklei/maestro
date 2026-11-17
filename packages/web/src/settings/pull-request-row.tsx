import type { CategoriesProposalRow } from "@maestro/core";
import { useState } from "react";
import {
  PULL_REQUEST_LABEL,
  PULL_REQUEST_ROW,
  pullRequestRow,
  VIEW_ON_HARNESS,
} from "../categories/pull-request-copy";
import { GatedButton } from "../ui/gated-button";
import { StatusBadge } from "../ui/status-badge";
import { TextLink } from "../ui/text-link";
import { CreatePullRequest } from "./create-pull-request";
import { SettingsRow } from "./settings-row";

// The row Pull request to the Harness (#1910): where the operator's
// categories pull request stands, and Create or Update pull request.
export function PullRequestRow({
  row,
  report,
}: {
  /** Undefined while the first read runs. */
  row: CategoriesProposalRow | undefined;
  /** The screen's status region, for the busy label and the done sentence. */
  report: (write: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (row === undefined) return null;
  const view = pullRequestRow(row);
  return (
    <>
      <SettingsRow
        name={PULL_REQUEST_ROW}
        description={view.sentence}
        control={
          // One group, so the button never wraps apart from its chip.
          <div className="flex flex-wrap items-center gap-inline font-ui text-row">
            {view.open === null ? null : (
              <>
                <StatusBadge reading={view.open} />
                <TextLink to="/harness">{VIEW_ON_HARNESS}</TextLink>
              </>
            )}
            <GatedButton
              label={PULL_REQUEST_LABEL[view.mode]}
              unavailable={view.blocked}
              onClick={() => setOpen(true)}
            />
          </div>
        }
      />
      {open ? (
        <CreatePullRequest
          mode={view.mode}
          update={row.state === "own-open" ? row.number : null}
          closed={row.state === "closed" ? row.number : null}
          report={report}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
