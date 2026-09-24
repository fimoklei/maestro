import { useState } from "react";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DIALOG_CANCEL, DialogShell } from "../ui/dialog-shell";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import { SegmentedControl } from "../ui/segmented-control";
import { ReleaseDelta } from "./release-delta";
import type { ReleasePlan, SemverStep, StructuralProblem } from "./use-harness";

// Loading and error travel with the plan so the modal stays mounted — a focus
// trap that unmounts between states loses the author's place (remove dialog).
export type ReleasePlanLoad =
  | { kind: "loading" }
  | { kind: "error"; notice: NoticeContent }
  | { kind: "ready"; plan: ReleasePlan };

const STEP_SEGMENTS: readonly { value: SemverStep; label: string }[] = [
  { value: "patch", label: "Patch" },
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
];

// One advisory sentence per broken manifest. States the fact, never a verdict:
// the skill still ships, the author just knows what they are shipping (#519).
const FINDING_TEXT: Record<StructuralProblem, string> = {
  "missing-manifest": "has no SKILL.md.",
  "invalid-frontmatter": "has frontmatter Maestro cannot read.",
  "empty-description": "has an empty description.",
};

// The consequences-first release plan: what the tag would carry, the proposed
// number and why, and the exact revision it points at, then the author's
// chosen step and the action that tags it. Presentational — the host owns
// both the plan query and the publish mutation.
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
  const heading = `Publish release for ${origin}`;
  // `null` until the author overrides it; the proposal fills in until then, so
  // one state serves both the display and what Publish sends.
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
  const step =
    load.kind === "ready" ? (chosenStep ?? load.plan.proposedStep) : null;
  const plan = load.kind === "ready" ? load.plan : null;

  return (
    <DialogShell
      label={heading}
      // The plan is the body, and it arrives after the panel is announced.
      describedBy={null}
      width={640}
      height="tall"
      destructive
      onClose={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-gray-7 border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-gray-12 text-prose">
          Publish release for <span className="font-mono">{origin}</span>
        </h2>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {/* The plan is the answer to the click that opened this dialog, so
              its failure is a user-action, not a panel that failed on load. */}
        <Notice
          trigger="user-action"
          notice={load.kind === "error" ? load.notice : null}
        />
        {load.kind === "loading" ? (
          <p className="font-ui text-meta text-gray-11">
            Loading the release plan…
          </p>
        ) : load.kind === "ready" ? (
          <PlanBody
            plan={load.plan}
            step={chosenStep ?? load.plan.proposedStep}
            onStepChange={setChosenStep}
          />
        ) : null}
        <Notice trigger="user-action" notice={publishError} />
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-gray-7 border-t px-3.5 py-3">
        <span className="flex-1" />
        <Button
          type="button"
          className="shrink-0"
          variant="quiet"
          size="sm"
          {...DIALOG_CANCEL}
          onClick={onClose}
        >
          Close
        </Button>
        <Button
          type="button"
          className="shrink-0"
          variant="primary"
          size="sm"
          busy={publishing}
          disabled={step === null || plan === null || plan.delta.length === 0}
          onClick={() =>
            step !== null && plan !== null && onPublish(step, plan)
          }
        >
          {publishing ? ACTIONS.create.busy : "Publish release"}
        </Button>
      </div>
    </DialogShell>
  );
}

// Consequences first: what the tag would carry, then what is risky about it,
// and only then the number. The chosen step is lifted to the dialog, which
// also needs it for Publish. Every version comes from the plan's map, so the
// browser never re-derives semver.
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
        <p className="font-ui text-meta text-gray-11">
          No skill has changed since the last release.
        </p>
      ) : (
        <ReleaseDelta movements={plan.delta} />
      )}

      {plan.findings.length === 0 ? null : (
        <div
          role="status"
          aria-label="Structural checks"
          className="flex flex-col gap-1.5 rounded-control border border-amber-7 bg-amber-3 px-2.5 py-2.5"
        >
          <span className="font-semibold font-ui text-amber-12 text-meta">
            Skill checks need attention
          </span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {plan.findings.map((finding) => (
              <li
                key={finding.skill}
                className="font-ui text-meta text-gray-12"
              >
                <span className="font-mono text-gray-12">{finding.skill}</span>{" "}
                {FINDING_TEXT[finding.problem]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card padded>
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="Previous tag" value={plan.previousTag ?? "None yet"} />
          <Fact label="Branch" value={plan.defaultBranch} />
          {/* The whole commit: a short hash is not the exact revision, and
              need not be unique in a repository this size (#519). */}
          <Fact label="Revision" value={plan.revision} wrap />
        </dl>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-meta leading-[inherit] tracking-mono-wide text-gray-11 uppercase">
              Releasing as
            </span>
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
