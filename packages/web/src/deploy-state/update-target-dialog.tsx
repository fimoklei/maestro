import type {
  CopyConsentRow,
  UpdateOutcomeRow,
  UpdatePreview,
  UpdateSkillRow,
} from "@maestro/core";
import { type ReactNode, useId, useState } from "react";
import { cn } from "../ui/cn";
import { UPDATE_TARGET } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { GitHubMarkLink } from "../ui/github-mark-link";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { Report } from "../ui/report";
import { StatusBadge } from "../ui/status-badge";
import { STATUS_TOKENS } from "../ui/status-family";
import { reading } from "../ui/status-reading";
import type { DeployStateNotice } from "./notice-copy";
import { updateOutcomeReport } from "./update-outcome-report";
import {
  ADDED_BY_THIS_DEPLOY,
  BECOMES_EMPTY,
  CHANGED,
  CONSENT_NOT_GIVEN,
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
  UNCHANGED,
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_SENTENCE,
  unverifiedSentence,
  updateDialogTitle,
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
        "font-ui text-meta",
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
    <section className="grid grid-cols-1 gap-x-panel gap-y-tight py-cell sm:grid-cols-[10.5rem_1fr]">
      <h3
        className={cn(
          "font-ui text-meta leading-5",
          signal ? STATUS_TOKENS.attention.ink : "text-gray-11",
        )}
      >
        {heading}
      </h3>
      <div className="flex min-w-0 flex-col gap-inline">{children}</div>
    </section>
  );
}

const listClass = (inline: boolean) =>
  inline ? "flex flex-wrap gap-x-panel gap-y-tight" : "flex flex-col gap-tight";

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
    <details className="flex flex-col gap-tight">
      <summary className="cursor-pointer font-ui text-gray-11 text-meta hover:text-gray-12 motion-safe:transition-colors">
        <SectionHeading inline>{foldedHeading(heading, count)}</SectionHeading>
        {note === null ? null : (
          <span className="font-ui text-meta">
            <span aria-hidden="true"> · </span>
            <span>{note}</span>
          </span>
        )}
      </summary>
      <div className="pt-tight">{children}</div>
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
        <li key={name} className="font-ui text-row text-gray-12">
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
          className="inline-flex items-center gap-tight font-ui text-row text-gray-12"
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
  /** Why no update can be priced, as a Blocked control cause. */
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
  const report =
    outcome && preview
      ? updateOutcomeReport({
          rows: outcome,
          releases: { from: preview.release, to: preview.chosenRelease },
          retry: incomplete,
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

  // On an incomplete update, `error` is the failed retry: it takes the place
  // of Update incomplete and keeps Retry update.
  const failure: NoticeContent | null = incomplete
    ? {
        ...(error
          ? { ...error, level: "error" }
          : {
              level: "warning",
              label: UPDATE_INCOMPLETE,
              message: UPDATE_INCOMPLETE_SENTENCE,
            }),
        action: {
          label: RETRY_UPDATE,
          onClick: onRetry,
          busy: isRunning ? "update" : undefined,
        },
      }
    : error && { ...error, level: "error" };
  const unavailable = blocked ?? (consentComplete ? null : CONSENT_NOT_GIVEN);

  return (
    <Dialog
      title={heading}
      version={null}
      width={640}
      phase={isRunning ? "running" : report === null ? "idle" : "outcome"}
      action={
        report === null && (preview !== null || blocked !== null)
          ? {
              label: UPDATE_TARGET,
              verb: "update",
              tone: "primary",
              unavailable,
              onRun: onConfirm,
            }
          : null
      }
      failure={failure}
      describedBy={preview === null ? null : leadInId}
      fieldsChanged={consented.length > 0}
      onClose={onCancel}
    >
      {preview !== null && report === null ? (
        <div className="flex items-center justify-between gap-inline">
          <p className="m-0 font-mono text-gray-11 text-meta">
            {releaseMoveLine(preview.release, preview.chosenRelease)}
          </p>
          {noContentChanges ? (
            <StatusBadge reading={reading(NO_CONTENT_CHANGES, "neutral")} />
          ) : null}
        </div>
      ) : null}
      {report !== null ? (
        <Report heading={report.heading} groups={report.groups} />
      ) : preview === null ? (
        isLoading ? (
          <p className="m-0 text-gray-11">{LOADING_PREVIEW}</p>
        ) : null
      ) : (
        <>
          <div className="flex flex-col gap-tight">
            <p id={leadInId} className="m-0">
              {countingSentence(preview.counts)}
            </p>
            {preview.selection.desired.length === 0 ? (
              <p className="m-0 text-gray-11">{BECOMES_EMPTY}</p>
            ) : null}
          </div>

          <div className="flex flex-col divide-y divide-divider border-divider border-y empty:hidden">
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
                {/* Each copy carries its own consent, never a set of them. */}
                <GroupedList
                  groups={[
                    {
                      tone: "attention",
                      legend: null,
                      rows: [
                        ...preview.localEdits.discard.map((row) => ({
                          key: consentKey(row),
                          name: `${DISCARD_LOCAL_EDITS} for ${consentRowName(row)}`,
                          sentence: (
                            <PhraseText
                              copy={localEditsSentence(
                                row.name,
                                preview.chosenRelease,
                              )}
                            />
                          ),
                        })),
                        ...preview.localEdits.unverified.map((row) => ({
                          key: consentKey(row),
                          name: `${OVERWRITE_UNVERIFIED} for ${consentRowName(row)}`,
                          sentence: (
                            <PhraseText copy={unverifiedSentence(row.name)} />
                          ),
                        })),
                      ],
                    },
                  ]}
                  checklist={{
                    checked: new Set(consented),
                    onToggle: toggle,
                    isRunning,
                    firstBox: null,
                  }}
                  live={null}
                />
                {preview.localEdits.discard.length > 0 ? (
                  <p className="m-0 text-gray-11">{KEEP_WORK_BY_IMPORTING}</p>
                ) : null}
              </Section>
            ) : null}
          </div>
          <div className="flex flex-col gap-inline empty:hidden">
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
    </Dialog>
  );
}
