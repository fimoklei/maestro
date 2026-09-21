import type {
  CopyConsentRow,
  UpdateOutcomeRow,
  UpdatePreview,
  UpdateSkillRow,
} from "@maestro/core";
import { type ReactNode, useId, useState } from "react";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { DialogShell } from "../ui/dialog-shell";
import { Notice } from "../ui/notice";
import type { DeployStateNotice } from "./notice-copy";
import { type OutcomeLine, updateOutcomeLines } from "./update-outcome-lines";
import {
  ADDED_BY_THIS_DEPLOY,
  BECOMES_EMPTY,
  CHANGED,
  CLOSE,
  consentRowName,
  countingSentence,
  DISCARD_LOCAL_EDITS,
  foldedHeading,
  KEEP_WORK_BY_IMPORTING,
  LOADING_PREVIEW,
  LOCAL_EDITS,
  localEditsSentence,
  NEW_IN_THIS_RELEASE,
  NO_CONTENT_CHANGES,
  NOT_ADDED,
  OVERWRITE_UNVERIFIED,
  REMOVED_BY_THIS_RELEASE,
  RETRY_UPDATE,
  releaseMoveLine,
  selectionAfterLine,
  UNCHANGED,
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_SENTENCE,
  UPDATE_TARGET,
  unverifiedSentence,
  updateDialogTitle,
  updatingLine,
} from "./update-target-copy";

// One consent, identified by the copy it licenses — the same grain the guard
// reads at, so one checkbox can never stand for two copies (#952).
const consentKey = (row: CopyConsentRow) => `${row.name}:${row.tool ?? ""}`;

// `inline` keeps a folded section's heading on the disclosure triangle's own
// line: a block heading inside `summary` pushes the text under the marker.
function SectionHeading({
  children,
  inline = false,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <h3
      className={cn(
        "font-mono text-tag uppercase tracking-tag",
        inline ? "inline text-inherit" : "text-dim",
      )}
    >
      {children}
    </h3>
  );
}

// Open by construction: the work is what the dialog opens on (spec story 19).
// One ruled row: the kind of change in a label column, its content beside it.
function Section({
  heading,
  signal = false,
  children,
}: {
  heading: string;
  signal?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[10.5rem_1fr]">
      <h3
        className={cn(
          "font-mono text-tag uppercase leading-5 tracking-tag",
          signal ? "text-amber-ink" : "text-dim",
        )}
      >
        {heading}
      </h3>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </section>
  );
}

const listClass = (inline: boolean) =>
  inline ? "flex flex-wrap gap-x-4 gap-y-0.5" : "flex flex-col gap-1";

// Folded behind its count, so a selection of forty-seven skills still opens on
// the work rather than on a list. `details` carries the toggle natively.
function FoldedSection({
  heading,
  count,
  note = null,
  children,
}: {
  heading: string;
  count: number;
  note?: string | null;
  children: ReactNode;
}) {
  return (
    <details className="flex flex-col gap-1">
      <summary className="cursor-pointer font-mono text-dim text-tag hover:text-fg-2 motion-safe:transition-colors">
        <SectionHeading inline>{foldedHeading(heading, count)}</SectionHeading>
        {note === null ? null : (
          <span className="font-mono text-tag">
            <span aria-hidden="true"> · </span>
            <span>{note}</span>
          </span>
        )}
      </summary>
      <div className="pt-1.5">{children}</div>
    </details>
  );
}

function NameList({
  names,
  inline = false,
}: {
  names: readonly string[];
  inline?: boolean;
}) {
  return (
    <ul className={listClass(inline)}>
      {names.map((name) => (
        <li key={name} className="font-mono text-data text-fg">
          {name}
        </li>
      ))}
    </ul>
  );
}

// The link text names the skill, so the destination is named in the link
// itself (design.md). A row with no readable origin keeps the name and drops
// the link rather than pointing at a guess.
function SkillRows({
  rows,
  inline = false,
}: {
  rows: readonly UpdateSkillRow[];
  inline?: boolean;
}) {
  return (
    <ul className={listClass(inline)}>
      {rows.map((row) => (
        <li key={row.name} className="font-mono text-data text-fg">
          {row.url === null ? (
            row.name
          ) : (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dim decoration-dotted underline-offset-2 hover:decoration-fg motion-safe:transition-colors"
            >
              {row.name}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

// The section that takes input. Each copy states its own cost and carries its
// own consent: confirmation covers every copy at risk, never a set of them
// (spec story 37).
function ConsentRow({
  row,
  label,
  sentence,
  checked,
  onToggle,
}: {
  row: CopyConsentRow;
  label: string;
  sentence: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-item border border-amber-border bg-amber-bg px-3 py-2">
      <p className="font-ui text-amber-ink text-desc">{sentence}</p>
      <label className="flex cursor-pointer items-center gap-2 font-ui text-desc text-fg">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-amber"
        />
        {`${label} for ${consentRowName(row)}`}
      </label>
    </li>
  );
}

// One line per skill, from what the server read back — never from what the
// update asked for (spec story 28, in the shape of the removal trace).
function OutcomeTrace({ lines }: { lines: readonly OutcomeLine[] }) {
  return (
    <div role="status">
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li
            key={line.key}
            className={cn(
              "flex items-start gap-1.5 font-mono text-tag",
              line.ok ? "text-green-ink" : "text-amber-ink",
            )}
          >
            <span aria-hidden="true">{line.ok ? "✓" : "✗"}</span>
            <span className="break-all">{line.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Prices an Update, asks for what it costs, and states what landed. The host
// owns the request; this reads what came back (#953, #954).
export function UpdateTargetDialog({
  targetName,
  preview,
  isLoading,
  error,
  blocked = null,
  outcome,
  isRunning = false,
  incomplete = false,
  onRetry = () => {},
  onCancel,
  onConfirm,
}: {
  // The target's own label, as the card shows it.
  targetName: string;
  // Null while the preview is being read, and after a refusal — the dialog
  // never prices an update from a reading it did not get (J04).
  preview: UpdatePreview | null;
  isLoading: boolean;
  error: DeployStateNotice | null;
  // The confirm's label where the refusal has no way through inside this
  // dialog: the control stays on screen, disabled, stating its cause (#960).
  blocked?: string | null;
  // Present once apm ran: what every copy reads as now. It replaces the
  // sections, so the reader is never shown a plan beside its result.
  outcome?: readonly UpdateOutcomeRow[] | null;
  isRunning?: boolean;
  incomplete?: boolean;
  onRetry?: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // UI state: which copies the reader has agreed to overwrite in this dialog.
  // It never leaves the screen — the proof the server acts on is the receipt
  // the preview carried (frontend.md, #952).
  const [consented, setConsented] = useState<readonly string[]>([]);
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;

  const heading = updateDialogTitle(targetName);
  // The outcome replaces the plan: one screen states either what an update
  // would do, or what it did.
  const lines =
    outcome && preview
      ? updateOutcomeLines(outcome, {
          from: preview.release,
          to: preview.chosenRelease,
        })
      : null;
  const required =
    preview === null
      ? []
      : [...preview.localEdits.discard, ...preview.localEdits.unverified].map(
          consentKey,
        );
  const consentComplete = required.every((key) => consented.includes(key));
  // Maestro's own reading from content hashes, never apm's: a release that
  // touches nothing selected is still adoptable (spec story 21).
  const noContentChanges =
    preview !== null &&
    preview.counts.changed === 0 &&
    preview.counts.removed === 0;

  const toggle = (key: string) =>
    setConsented((keys) =>
      keys.includes(key) ? keys.filter((held) => held !== key) : [...keys, key],
    );

  return (
    <DialogShell
      label={heading}
      describedBy={preview === null ? null : leadInId}
      width={640}
      onClose={onCancel}
    >
      <div className="flex shrink-0 items-start justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Update <span className="break-all font-mono">{targetName}</span>
          </h2>
          {preview !== null && lines === null ? (
            <p className="font-mono text-dim text-mono-sm">
              {releaseMoveLine(preview.release, preview.chosenRelease)}
            </p>
          ) : null}
        </div>
        {noContentChanges ? <Chip tone="dim">{NO_CONTENT_CHANGES}</Chip> : null}
      </div>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-3.5 py-3">
        {lines !== null ? (
          <>
            <OutcomeTrace lines={lines} />
            {incomplete ? (
              <Notice
                trigger="user-action"
                notice={{
                  level: "warning",
                  label: UPDATE_INCOMPLETE,
                  message: UPDATE_INCOMPLETE_SENTENCE,
                  action: { label: RETRY_UPDATE, onClick: onRetry },
                }}
              />
            ) : null}
          </>
        ) : preview === null ? (
          <p className="font-ui text-desc text-dim">
            {isLoading ? LOADING_PREVIEW : null}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p id={leadInId} className="font-ui text-desc text-fg">
                {countingSentence(preview.counts)}
              </p>
              <p className="font-ui text-desc text-muted">
                {preview.selection.desired.length === 0
                  ? BECOMES_EMPTY
                  : selectionAfterLine(preview.selection.desired)}
              </p>
            </div>

            {/* The fixed order, whichever sections this preview has. */}
            <div className="flex flex-col divide-y divide-line-row border-line-row border-y empty:hidden">
              {preview.addedByThisDeploy.length > 0 ? (
                <Section heading={ADDED_BY_THIS_DEPLOY}>
                  <SkillRows rows={preview.addedByThisDeploy} inline={true} />
                </Section>
              ) : null}
              {preview.changed.length > 0 ? (
                <Section heading={CHANGED}>
                  <SkillRows rows={preview.changed} inline={true} />
                </Section>
              ) : null}
              {preview.removed.length > 0 ? (
                <Section heading={REMOVED_BY_THIS_RELEASE}>
                  <NameList names={preview.removed} inline={true} />
                </Section>
              ) : null}
              {required.length > 0 ? (
                <Section heading={LOCAL_EDITS} signal={true}>
                  <ul className="flex flex-col gap-2">
                    {preview.localEdits.discard.map((row) => (
                      <ConsentRow
                        key={consentKey(row)}
                        row={row}
                        label={DISCARD_LOCAL_EDITS}
                        sentence={localEditsSentence(
                          row.name,
                          preview.chosenRelease,
                        )}
                        checked={consented.includes(consentKey(row))}
                        onToggle={() => toggle(consentKey(row))}
                      />
                    ))}
                    {preview.localEdits.unverified.map((row) => (
                      <ConsentRow
                        key={consentKey(row)}
                        row={row}
                        label={OVERWRITE_UNVERIFIED}
                        sentence={unverifiedSentence(row.name)}
                        checked={consented.includes(consentKey(row))}
                        onToggle={() => toggle(consentKey(row))}
                      />
                    ))}
                  </ul>
                  {preview.localEdits.discard.length > 0 ? (
                    <p className="font-ui text-desc text-muted">
                      {KEEP_WORK_BY_IMPORTING}
                    </p>
                  ) : null}
                </Section>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 empty:hidden">
              {preview.unchanged.length > 0 ? (
                <FoldedSection
                  heading={UNCHANGED}
                  count={preview.unchanged.length}
                >
                  <NameList names={preview.unchanged} />
                </FoldedSection>
              ) : null}
              {/* No checkbox here: Update adds no skill automatically (story 18). */}
              {preview.newInRelease.length > 0 ? (
                <FoldedSection
                  heading={NEW_IN_THIS_RELEASE}
                  count={preview.newInRelease.length}
                  note={NOT_ADDED}
                >
                  <SkillRows rows={preview.newInRelease} />
                </FoldedSection>
              ) : null}
            </div>
          </>
        )}

        <Notice
          trigger="user-action"
          notice={error ? { ...error, level: "error" } : null}
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2.5 border-line-row border-t px-3.5 py-3">
        <Button type="button" variant="quiet" size="sm" onClick={onCancel}>
          {lines === null ? "Cancel" : CLOSE}
        </Button>
        {/* The one amber fill in this view; the card's own control is the ghost
            variant (ADR-0031, design.md § the signal rule). */}
        {blocked !== null ? (
          <Button type="button" variant="primary" size="sm" disabled={true}>
            {blocked}
          </Button>
        ) : preview === null || lines !== null ? null : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!consentComplete || isRunning}
            onClick={onConfirm}
          >
            {isRunning ? updatingLine(preview.chosenRelease) : UPDATE_TARGET}
          </Button>
        )}
      </div>
    </DialogShell>
  );
}
