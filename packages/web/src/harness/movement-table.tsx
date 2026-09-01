import { useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { Notice, type NoticeContent } from "../ui/notice";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { TypeTag } from "../ui/type-tag";
import { CONCURRENT_CHANGE_NOTICE } from "./notice-copy";
import type { HarnessMovement } from "./use-harness";

// Promotion as the row sees it: what a press does, which row is waiting on the
// remote, and what the presses of this visit left behind. Every skill promoted
// here keeps its link, so promoting a second one does not take the first
// author's way to GitHub with it (#577).
export type PromoteRowState = {
  onPromote: (skill: string) => void;
  // Closed while the remote's answer is unknown — the rule that closes Release.
  enabled: boolean;
  pending: string | null;
  // Skill → the URL that opens GitHub's pull-request flow.
  pullRequests: Record<string, string>;
  // The one whose press just landed: the only row that takes focus.
  justMoved: string | null;
  failed: { skill: string; notice: NoticeContent } | null;
};

// The rows of one state-named section. Type is a column even though every row
// is a skill today: Inventory already tags its type, and hooks and MCP servers
// then slot in without reshaping the table (#347).
export function MovementTable({
  movements,
  promote,
}: {
  movements: HarnessMovement[];
  promote?: PromoteRowState;
}) {
  // A header no row honours is a claim: Pending review carries an Action column
  // only once one of its rows holds a link.
  const actions =
    promote !== undefined &&
    movements.some(
      (movement) =>
        promotable(movement) ||
        promote.pullRequests[movement.skill] !== undefined,
    );
  return (
    // Narrow, the columns would crush the name to nothing. The table keeps a
    // floor and the section scrolls sideways instead (#347).
    <div className="overflow-x-auto">
      <Table className="min-w-[320px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Name</TableHead>
            {actions ? <TableHead className="w-32">Action</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((movement) => (
            <TableRow key={movement.skill}>
              <TableCell>
                <TypeTag />
              </TableCell>
              <TableCell title={movement.skill} className="text-data">
                {/* Name truncates, the chip stays: a long name must not clip
                    the one label this read carries — a deletion, the only
                    movement named today; additions and edits stay bare (#575). */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-fg">
                    {movement.skill}
                  </span>
                  {movement.deletion ? (
                    <Chip tone="drift" className="shrink-0">
                      deleted locally
                    </Chip>
                  ) : null}
                </div>
                {promote?.failed?.skill === movement.skill ? (
                  // On the row it failed on, not in a dialog: the press is
                  // still there, and a refusal changed nothing (#577).
                  <div className="mt-1">
                    <Notice
                      trigger="user-action"
                      notice={promote.failed.notice}
                    />
                  </div>
                ) : null}
                {promotable(movement) && movement.concurrentChange ? (
                  // Painted with the row, not in answer to a press, so it
                  // stays polite.
                  <div className="mt-1">
                    <Notice trigger="load" notice={CONCURRENT_CHANGE_NOTICE} />
                  </div>
                ) : null}
              </TableCell>
              {actions && promote ? (
                <TableCell>{promoteCell(movement, promote)}</TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Where Maestro stops and GitHub takes over. The promoted row moves sections,
// taking the pressed button with it, so focus follows to what replaced it
// rather than falling back to the document. Mounted once per promotion.
function PullRequestLink({ href, focus }: { href: string; focus: boolean }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focus) {
      link.current?.focus();
    }
  }, [focus]);
  return (
    <a
      ref={link}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="whitespace-nowrap font-mono text-amber-ink text-tag underline"
    >
      pull request →
    </a>
  );
}

// A deletion publishes by removal and takes a confirmation of its own, which
// the host opens — from here both are the same press (#497, #580).
const promotable = (movement: HarnessMovement) =>
  movement.state === "pending-promotion";

// One cell, three readings: the press that is still to come, the wait, and the
// link that takes a pushed skill to GitHub.
function promoteCell(movement: HarnessMovement, promote: PromoteRowState) {
  // The freshly read row decides before this visit's links do: a skill that is
  // promotable again outlived the branch its link points at, and the link would
  // stand in front of the press until the page is reloaded (#577).
  if (!promotable(movement)) {
    const pullRequest = promote.pullRequests[movement.skill];
    return pullRequest === undefined ? null : (
      <PullRequestLink
        href={pullRequest}
        focus={promote.justMoved === movement.skill}
      />
    );
  }
  const waiting = promote.pending === movement.skill;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!promote.enabled || promote.pending !== null}
      onClick={() => promote.onPromote(movement.skill)}
    >
      {waiting ? "Proposing change…" : "Propose change"}
    </Button>
  );
}
