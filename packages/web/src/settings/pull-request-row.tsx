import type { CategoriesProposalRow } from "@maestro/core";
import { useState } from "react";
import {
  CREATE_PULL_REQUEST,
  PULL_REQUEST_ROW,
  pullRequestRow,
  VIEW_ON_HARNESS,
} from "../categories/pull-request-copy";
import { doneSentence } from "../ui/busy-copy";
import { GatedButton } from "../ui/gated-button";
import { plainText } from "../ui/phrase";
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
  /** The screen's status region, for the done sentence. */
  report: (sentence: string) => void;
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
          <>
            {view.open === null ? null : (
              <>
                <StatusBadge reading={view.open} />
                <TextLink to="/harness">{VIEW_ON_HARNESS}</TextLink>
              </>
            )}
            <GatedButton
              label={view.action}
              unavailable={view.blocked}
              onClick={() => setOpen(true)}
            />
          </>
        }
      />
      {open ? (
        <CreatePullRequest
          update={row.state === "own-open" ? row.number : null}
          onCreated={({ number }) => {
            setOpen(false);
            report(
              plainText(
                doneSentence(
                  view.action === CREATE_PULL_REQUEST ? "create" : "update",
                  `pull request #${number}`,
                ),
              ),
            );
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
