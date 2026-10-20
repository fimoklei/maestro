import type { ReleasePlan, SemverStep } from "@maestro/core";
import { useId, useState } from "react";
import { BRANCH_FACT, NOT_RELEASED_YET } from "../ui/band-copy";
import { loadingText } from "../ui/busy-copy";
import { Card } from "../ui/card";
import { PUBLISH_RELEASE } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import { machine, named, phrase } from "../ui/phrase";
import { PhraseText } from "../ui/phrase-text";
import { SegmentedControl } from "../ui/segmented-control";
import { StatusLine } from "../ui/status-line";
import { FINDING_TEXT, skillChecksNotice } from "./dialog-copy";
import { ReleaseDelta } from "./release-delta";

// Loading and error travel with the plan so the modal stays mounted: a focus
// trap that unmounts between states loses the author's place.
export type ReleasePlanLoad =
  | { kind: "loading" }
  | { kind: "error"; notice: NoticeContent }
  | { kind: "ready"; plan: ReleasePlan };

const STEP_SEGMENTS: readonly { value: SemverStep; label: string }[] = [
  { value: "patch", label: "Patch" },
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
];

export function ReleaseDialog({
  origin,
  load,
  onClose,
  onPublish,
  publishing,
  publishError,
}: {
  origin: string;
  load: ReleasePlanLoad;
  onClose: () => void;
  onPublish: (step: SemverStep, plan: ReleasePlan) => void;
  publishing: boolean;
  publishError: NoticeContent | null;
}) {
  const [chosenStep, setChosenStep] = useState<SemverStep | null>(null);
  // A step chosen against one previous tag names a different release under
  // the recomputed one, so the choice is dropped with the plan it belonged
  // to (#521).
  const planId =
    load.kind === "ready"
      ? [
          load.plan.previousTag,
          load.plan.previousTagCommit,
          load.plan.revision,
        ].join("@")
      : null;
  const [shownPlanId, setShownPlanId] = useState(planId);
  // A blocked Publish release keeps its label and points at the line that says why.
  const loadingId = useId();
  const emptyId = useId();
  if (planId !== shownPlanId) {
    setShownPlanId(planId);
    setChosenStep(null);
  }

  return (
    <Dialog
      title={`${PUBLISH_RELEASE} for ${origin}`}
      version={null}
      width={480}
      phase={publishing ? "running" : "idle"}
      // It pushes a tag to GitHub, so it is confirmed like a deletion.
      action={{
        label: PUBLISH_RELEASE,
        verb: "publish",
        tone: "danger",
        unavailable:
          load.kind === "loading"
            ? { describedBy: loadingId }
            : load.kind === "error"
              ? { failure: true }
              : load.plan.delta.length === 0
                ? { describedBy: emptyId }
                : null,
        onRun: () =>
          load.kind === "ready" &&
          onPublish(chosenStep ?? load.plan.proposedStep, load.plan),
      }}
      failure={publishError ?? (load.kind === "error" ? load.notice : null)}
      // The plan is the body, and it arrives after the panel is announced.
      describedBy={null}
      fieldsChanged={chosenStep !== null}
      onClose={onClose}
    >
      {load.kind === "loading" ? (
        <StatusLine id={loadingId}>{loadingText("release plan")}</StatusLine>
      ) : load.kind === "ready" ? (
        <PlanBody
          emptyId={emptyId}
          plan={load.plan}
          step={chosenStep ?? load.plan.proposedStep}
          onStepChange={setChosenStep}
        />
      ) : null}
    </Dialog>
  );
}

// Every version comes from the plan's map, so the browser never re-derives
// semver.
function PlanBody({
  emptyId,
  plan,
  step,
  onStepChange,
}: {
  emptyId: string;
  plan: ReleasePlan;
  step: SemverStep;
  onStepChange: (step: SemverStep) => void;
}) {
  return (
    <>
      {plan.delta.length === 0 ? (
        <p id={emptyId} className="m-0 text-gray-11">
          No skill has changed since the last release.
        </p>
      ) : (
        <ReleaseDelta movements={plan.delta} />
      )}

      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact
            label="Previous tag"
            value={plan.previousTag ?? NOT_RELEASED_YET}
          />
          <Fact label={BRANCH_FACT} value={plan.defaultBranch} />
          {/* The whole commit: a short hash is not the exact revision, and
              need not be unique in a repository this size (#519). */}
          <Fact label="Revision" value={plan.revision} wrap />
        </dl>
        <div className="mt-panel flex flex-wrap items-end justify-between gap-x-panel gap-y-cell">
          <div className="flex flex-col gap-tight">
            <span className="font-ui text-gray-11 text-meta">Releasing as</span>
            <span className="font-mono text-gray-12 text-title">
              {plan.versions[step]}
            </span>
            {/* Maestro's proposal is a fact about the delta, so it stands
                unchanged beside whatever the author picks. */}
            <span className="font-ui text-meta text-gray-11">
              <PhraseText
                copy={phrase`Suggested: ${machine(plan.versions[plan.proposedStep])}. ${plan.reason}`}
              />
            </span>
          </div>
          <SegmentedControl
            label="Version step"
            segments={STEP_SEGMENTS}
            value={step}
            onChange={onStepChange}
          />
        </div>
      </Card>
      <Notice
        trigger="load"
        notice={
          plan.findings.length === 0
            ? null
            : skillChecksNotice(
                "publish",
                plan.findings.map(
                  (finding) =>
                    phrase`${named(finding.skill)} ${FINDING_TEXT[finding.problem]}`,
                ),
              )
        }
      />
    </>
  );
}
