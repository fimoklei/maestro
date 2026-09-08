import { useEffect, useRef } from "react";
import { ActionsMenu, type ActionsMenuProps } from "../ui/actions-menu";
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
import {
  crossStageLine,
  detailSentence,
  reviewerLine,
  STAGE_NAMES,
  type StageContext,
  statusReading,
  statusTone,
} from "./stage-copy";
import type { HarnessStageRow } from "./use-harness";

// What the host lets a row do. The links come from the read model; anything
// that presses is passed in, so this file renders and decides nothing.
export type StageRowActions = {
  items: (row: HarnessStageRow) => ActionsMenuProps["items"];
  // The row a refused press belongs to, stated where the press was.
  failed: { skill: string; notice: NoticeContent } | null;
  // The skill whose press just landed. Its row moved stage, taking the menu it
  // was pressed from with it, so focus follows to the row that replaced it
  // rather than falling back to the document (#581).
  focus?: string | null;
  // The skill a confirmation just sent the author to. Its row sits on the
  // active surface until the host drops it — a step of the surface ramp, not a
  // transition, so reduced motion is honoured by construction (#846).
  highlight?: string | null;
};

// One stage's rows. Type is a column even though every row is a skill today:
// hooks and MCP servers slot in without reshaping the table (#347).
export function StageTable({
  rows,
  context,
  actions,
}: {
  rows: HarnessStageRow[];
  context: StageContext;
  actions: StageRowActions;
}) {
  return (
    // Narrow, the five columns would crush the name to nothing. The table keeps
    // a floor and scrolls sideways inside the card instead; Detail wraps.
    <div className="overflow-x-auto">
      <Table className="min-w-[760px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Type</TableHead>
            <TableHead className="w-48">Name</TableHead>
            <TableHead className="w-56">Status</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead className="w-12 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const reviewers = reviewerLine(row);
            const crossStage = crossStageLine(row);
            return (
              <TableRow
                key={`${row.stage}:${row.skill}`}
                className={
                  actions.highlight === row.skill ? "bg-active" : undefined
                }
              >
                <TableCell className="align-top">
                  <TypeTag />
                </TableCell>
                <TableCell title={row.skill} className="align-top text-data">
                  <span className="block truncate font-mono text-fg">
                    {row.skill}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <Chip tone={statusTone(row)}>{statusReading(row)}</Chip>
                </TableCell>
                <TableCell className="align-top text-desc text-muted">
                  {/* Wraps rather than truncates: the sentence is the reason
                      the row is here, and half of it says nothing. */}
                  <p className="m-0 whitespace-normal">
                    {detailSentence(row, context)}
                  </p>
                  {reviewers === null ? null : (
                    <p className="m-0 mt-1 whitespace-normal text-dim">
                      {reviewers}
                    </p>
                  )}
                  {crossStage === null ? null : (
                    <p className="m-0 mt-1 whitespace-normal text-dim">
                      {crossStage}
                    </p>
                  )}
                  {actions.failed?.skill === row.skill ? (
                    // On the row it failed on, not in a dialog: the press is
                    // still there, and a refusal changed nothing (#577).
                    <div className="mt-1">
                      <Notice
                        trigger="user-action"
                        notice={actions.failed.notice}
                      />
                    </div>
                  ) : null}
                  {row.concurrentChange ? (
                    // Painted with the row, not in answer to a press, so it
                    // stays polite.
                    <div className="mt-1">
                      <Notice
                        trigger="load"
                        notice={CONCURRENT_CHANGE_NOTICE}
                      />
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top text-right">
                  <RowMenu
                    // Named by its stage too: one skill can hold a row in
                    // every stage, and three menus called "Actions for tdd"
                    // would name the same thing three times (copy.md · R-A).
                    label={`Actions for ${row.skill} in ${STAGE_NAMES[row.stage]}`}
                    items={actions.items(row)}
                    focus={actions.focus === row.skill}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// The menu of one row, which takes the keyboard when the press that moved this
// row here has just landed.
function RowMenu({
  label,
  items,
  focus,
}: ActionsMenuProps & { focus: boolean }) {
  const cell = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focus) {
      cell.current?.querySelector("button")?.focus();
    }
  }, [focus]);
  return (
    <span ref={cell}>
      <ActionsMenu label={label} items={items} />
    </span>
  );
}
