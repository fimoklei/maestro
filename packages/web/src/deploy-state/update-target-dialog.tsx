import type {
  CopyConsentRow,
  UpdateOutcomeRow,
  UpdatePreview,
  UpdateSkillRow,
} from "@maestro/core";
import { type ReactNode, useId, useState } from "react";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { GitHubMarkLink } from "../ui/github-mark-link";
import { Notice } from "../ui/notice";
import { StatusBadge } from "../ui/status-badge";
import { reading } from "../ui/status-reading";
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

// The same grain the guard reads at, so one checkbox never stands for two copies (#952).
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
        "font-mono text-meta uppercase tracking-mono",
        inline ? "inline text-inherit" : "text-gray-11",
      )}
    >
      {children}
    </h3>
  );
}

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
          "font-mono text-meta uppercase leading-5 tracking-mono",
          signal ? "text-amber-12" : "text-gray-11",
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
      <summary className="cursor-pointer font-mono text-gray-11 text-meta hover:text-gray-12 motion-safe:transition-colors">
        <SectionHeading inline>{foldedHeading(heading, count)}</SectionHeading>
        {note === null ? null : (
          <span className="font-mono text-meta">
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
        <li key={name} className="font-mono text-row text-gray-12">
          {name}
        </li>
      ))}
    </ul>
  );
}

// A row with no readable origin drops the link rather than point at a guess.
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
        <li
          key={row.name}
          className="inline-flex items-center gap-1 font-mono text-row text-gray-12"
        >
          {row.name}
          <GitHubMarkLink
            page={row.url === null ? undefined : { kind: "link", url: row.url }}
            name={row.name}
            focusable={true}
          />
        </li>
      ))}
    </ul>
  );
}

// Each copy carries its own consent, never a set of them.
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
    <li className="flex flex-col gap-1 rounded-control border border-amber-7 bg-amber-3 px-3 py-2">
      <p className="font-ui text-amber-12 text-meta">{sentence}</p>
      <label className="flex cursor-pointer items-center gap-2 font-ui text-meta text-gray-12">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="accent-amber-11"
        />
        {`${label} for ${consentRowName(row)}`}
      </label>
    </li>
  );
}

function OutcomeTrace({ lines }: { lines: readonly OutcomeLine[] }) {
  return (
    <div role="status">
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li
            key={line.key}
            className={cn(
              "flex items-start gap-1.5 font-mono text-meta",
              line.ok ? "text-green-12" : "text-amber-12",
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

// Prices an Update, asks for consent, and states what landed. The host owns the request.
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
  targetName: string;
  // Null while loading and after a refusal: never price from a missing reading.
  preview: UpdatePreview | null;
  isLoading: boolean;
  error: DeployStateNotice | null;
  blocked?: string | null;
  outcome?: readonly UpdateOutcomeRow[] | null;
  isRunning?: boolean;
  incomplete?: boolean;
  onRetry?: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Never leaves the screen: the server acts on the preview's receipt (#952).
  const [consented, setConsented] = useState<readonly string[]>([]);
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;

  const heading = updateDialogTitle(targetName);
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
      <div className="flex shrink-0 items-start justify-between gap-2.5 border-gray-7 border-b px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-semibold font-ui text-gray-12 text-prose">
            Update <span className="break-all font-mono">{targetName}</span>
          </h2>
          {preview !== null && lines === null ? (
            <p className="font-mono text-gray-11 text-meta">
              {releaseMoveLine(preview.release, preview.chosenRelease)}
            </p>
          ) : null}
        </div>
        {noContentChanges ? (
          <StatusBadge reading={reading(NO_CONTENT_CHANGES, "neutral")} />
        ) : null}
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
          <p className="font-ui text-meta text-gray-11">
            {isLoading ? LOADING_PREVIEW : null}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p id={leadInId} className="font-ui text-meta text-gray-12">
                {countingSentence(preview.counts)}
              </p>
              <p className="font-ui text-meta text-gray-11">
                {preview.selection.desired.length === 0
                  ? BECOMES_EMPTY
                  : selectionAfterLine(preview.selection.desired)}
              </p>
            </div>

            <div className="flex flex-col divide-y divide-gray-7 border-gray-7 border-y empty:hidden">
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
                    <p className="font-ui text-meta text-gray-11">
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

      <div className={DIALOG_FOOTER}>
        <Button
          type="button"
          variant="quiet"
          className={lines === null ? undefined : "ml-auto"}
          onClick={onCancel}
        >
          {lines === null ? "Cancel" : CLOSE}
        </Button>
        {blocked !== null ? (
          <Button type="button" variant="primary" disabled={true}>
            {blocked}
          </Button>
        ) : preview === null || lines !== null ? null : (
          <Button
            type="button"
            variant="primary"
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
