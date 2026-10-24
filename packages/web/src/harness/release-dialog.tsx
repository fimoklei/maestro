import type { ReleasePlan, SemverStep } from "@maestro/core";
import { useId, useState } from "react";
import {
  DEFAULT_BRANCH_FACT,
  NOT_RELEASED_YET,
  ORIGIN_FACT,
} from "../ui/band-copy";
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
import {
  FINDING_TEXT,
  ROOT_SKILL_FILE,
  rootSkillFileNotice,
  skillChecksNotice,
} from "./dialog-copy";
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
  // A blocked Publish release keeps its label and points at the text that says why.
  const loadingId = useId();
  const blockedId = useId();
  // The origin's last path segment; the card names the whole origin.
  const repoName = origin.slice(origin.lastIndexOf("/") + 1);
  if (planId !== shownPlanId) {
    setShownPlanId(planId);
    setChosenStep(null);
  }

  return (
    <Dialog
      title={`${PUBLISH_RELEASE} for ${repoName}`}
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
              : load.plan.blocked !== null
                ? { describedBy: blockedId }
                : null,
        onRun: () =>
          load.kind === "ready" &&
          onPublish(chosenStep ?? load.plan.proposedStep, load.plan),
      }}
      failure={
        // The plan's own notice already states this refusal, with the branch.
        load.kind === "ready" &&
        load.plan.blocked === "root-skill-file" &&
        publishError?.label === ROOT_SKILL_FILE
          ? null
          : (publishError ?? (load.kind === "error" ? load.notice : null))
      }
      // The plan is the body, and it arrives after the panel is announced.
      describedBy={null}
      fieldsChanged={chosenStep !== null}
      onClose={onClose}
    >
      {load.kind === "loading" ? (
        <StatusLine id={loadingId}>{loadingText("release plan")}</StatusLine>
      ) : load.kind === "ready" ? (
        <PlanBody
          origin={origin}
          blockedId={blockedId}
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
  origin,
  blockedId,
  plan,
  step,
  onStepChange,
}: {
  origin: string;
  blockedId: string;
  plan: ReleasePlan;
  step: SemverStep;
  onStepChange: (step: SemverStep) => void;
}) {
  const empty = plan.delta.length === 0;
  return (
    <>
      <Card padded>
        <dl className="flex flex-wrap gap-x-panel gap-y-cell">
          <Fact label={ORIGIN_FACT} value={origin} title={origin} />
          <Fact
            label="Previous tag"
            value={plan.previousTag ?? NOT_RELEASED_YET}
          />
          <Fact label={DEFAULT_BRANCH_FACT} value={plan.defaultBranch} />
          {/* The whole commit: a short hash is not the exact revision, and
              need not be unique in a repository this size (#519). */}
          <Fact label="Revision" value={plan.revision} wrap />
        </dl>
        {/* A blocked plan has no version to release. */}
        {plan.blocked !== null ? null : (
          <div className="mt-panel flex flex-wrap items-end justify-between gap-x-panel gap-y-cell">
            <div className="flex flex-col gap-tight">
              <span className="font-ui text-gray-11 text-meta">
                Releasing as
              </span>
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
        )}
      </Card>
      {empty ? (
        <p
          id={plan.blocked === "empty-delta" ? blockedId : undefined}
          className="m-0 text-gray-11"
        >
          No changes yet. Changes merged after the last release appear here.
        </p>
      ) : (
        <ReleaseDelta movements={plan.delta} />
      )}
      {plan.blocked === "root-skill-file" ? (
        <Notice
          trigger="load"
          id={blockedId}
          notice={rootSkillFileNotice(plan.defaultBranch)}
        />
      ) : null}
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
