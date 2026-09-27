import { useState } from "react";
import { loadingText } from "../ui/busy-copy";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import { SegmentedControl } from "../ui/segmented-control";
import {
  FINDING_TEXT,
  RELEASE_UNAVAILABLE,
  skillChecksNotice,
} from "./dialog-copy";
import { ReleaseDelta } from "./release-delta";
import type { ReleasePlan, SemverStep } from "./use-harness";

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
  if (planId !== shownPlanId) {
    setShownPlanId(planId);
    setChosenStep(null);
  }

  return (
    <Dialog
      title={`Publish release for ${origin}`}
      version={null}
      width={640}
      phase={publishing ? "running" : "idle"}
      // It pushes a tag to GitHub, so it is confirmed like a deletion.
      action={{
        label: "Publish release",
        verb: "publish",
        tone: "danger",
        unavailable: unavailableCause(load),
        onRun: () =>
          load.kind === "ready" &&
          onPublish(chosenStep ?? load.plan.proposedStep, load.plan),
      }}
      failure={publishError}
      // The plan is the body, and it arrives after the panel is announced.
      describedBy={null}
      fieldsChanged={chosenStep !== null}
      onClose={onClose}
    >
      {/* The plan is the answer to the click that opened this dialog, so
          its failure is a user-action, not a panel that failed on load. */}
      <Notice
        trigger="user-action"
        notice={load.kind === "error" ? load.notice : null}
      />
      {load.kind === "loading" ? (
        <p className="m-0 text-gray-11">{loadingText("release plan")}</p>
      ) : load.kind === "ready" ? (
        <PlanBody
          plan={load.plan}
          step={chosenStep ?? load.plan.proposedStep}
          onStepChange={setChosenStep}
        />
      ) : null}
    </Dialog>
  );
}

function unavailableCause(load: ReleasePlanLoad): string | null {
  if (load.kind === "loading") return RELEASE_UNAVAILABLE.loading;
  if (load.kind === "error") return RELEASE_UNAVAILABLE.error;
  return load.plan.delta.length === 0 ? RELEASE_UNAVAILABLE.empty : null;
}

// Every version comes from the plan's map, so the browser never re-derives
// semver.
function PlanBody({
  plan,
  step,
  onStepChange,
}: {
  plan: ReleasePlan;
  step: SemverStep;
  onStepChange: (step: SemverStep) => void;
}) {
  return (
    <>
      {plan.delta.length === 0 ? (
        <p className="m-0 text-gray-11">
          No skill has changed since the last release.
        </p>
      ) : (
        <ReleaseDelta movements={plan.delta} />
      )}

      <Notice
        trigger="load"
        notice={
          plan.findings.length === 0
            ? null
            : skillChecksNotice(
                "publish",
                plan.findings.map(
                  (finding) =>
                    `${finding.skill} ${FINDING_TEXT[finding.problem]}`,
                ),
              )
        }
      />

      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact label="Previous tag" value={plan.previousTag ?? "None yet"} />
          <Fact label="Branch" value={plan.defaultBranch} />
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
              {`Suggested: ${plan.versions[plan.proposedStep]}. ${plan.reason}`}
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
    </>
  );
}
