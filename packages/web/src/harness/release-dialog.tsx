import { useState } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { FailureNote } from "../ui/failure-note";
import { SegmentedControl } from "../ui/segmented-control";
import { PendingRelease } from "./pending-release";
import type { ReleasePlan, SemverStep, StructuralProblem } from "./use-harness";

// Loading and error travel with the plan so the modal stays mounted — a focus
// trap that unmounts between states loses the author's place (remove dialog).
export type ReleasePlanLoad =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; plan: ReleasePlan };

const STEP_SEGMENTS: readonly { value: SemverStep; label: string }[] = [
  { value: "patch", label: "patch" },
  { value: "minor", label: "minor" },
  { value: "major", label: "major" },
];

// One advisory sentence per broken manifest. States the fact, never a verdict:
// the skill still ships, the author just knows what they are shipping (#519).
const FINDING_TEXT: Record<StructuralProblem, string> = {
  "missing-manifest": "has no SKILL.md",
  "invalid-frontmatter": "has frontmatter that does not parse",
  "empty-description": "has an empty description",
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
  onPublish: (step: SemverStep, previousTag: string | null) => void;
  publishing: boolean;
  publishError: string | null;
}) {
  const { panelRef, requestClose } = useModalDialog({
    onClose,
    closeEnabled: true,
  });
  const heading = `Release ${origin}`;
  // `null` until the author overrides it; the proposal fills in until then, so
  // one state serves both the display and what Publish sends.
  const [chosenStep, setChosenStep] = useState<SemverStep | null>(null);
  const step =
    load.kind === "ready" ? (chosenStep ?? load.plan.proposedStep) : null;
  const previousTag = load.kind === "ready" ? load.plan.previousTag : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        className="relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-card border border-line-row bg-chrome outline-none"
      >
        <div className="flex items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Release <span className="font-mono">{origin}</span>
          </h2>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
          {load.kind === "loading" ? (
            <p className="font-ui text-desc text-muted">
              Planning the release…
            </p>
          ) : load.kind === "error" ? (
            <FailureNote label="no plan to show" message={load.message} />
          ) : (
            <PlanBody
              plan={load.plan}
              step={chosenStep ?? load.plan.proposedStep}
              onStepChange={setChosenStep}
            />
          )}
          {publishError === null ? null : (
            <FailureNote label="release not published" message={publishError} />
          )}
        </div>

        <div className="flex items-center gap-2.5 border-line-row border-t px-3.5 py-3">
          <span className="flex-1" />
          <Button
            type="button"
            className="shrink-0"
            variant="quiet"
            size="sm"
            onClick={onClose}
          >
            close
          </Button>
          <Button
            type="button"
            className="shrink-0"
            variant="primary"
            size="sm"
            disabled={step === null || publishing}
            onClick={() => step !== null && onPublish(step, previousTag)}
          >
            {publishing ? "publishing…" : "publish"}
          </Button>
        </div>
      </div>
    </div>
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
        <p className="font-ui text-desc text-muted">
          No skill has changed since the last release.
        </p>
      ) : (
        <PendingRelease movements={plan.delta} />
      )}

      {plan.findings.length === 0 ? null : (
        <div
          role="status"
          aria-label="Structural checks"
          className="flex flex-col gap-1.5 rounded-control border border-line-drift bg-amber-bg px-2.5 py-2.5"
        >
          <span className="font-semibold font-ui text-amber-ink text-desc">
            Structural checks — advisory, does not block release
          </span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {plan.findings.map((finding) => (
              <li key={finding.skill} className="font-ui text-desc text-fg-2">
                <span className="font-mono text-fg">{finding.skill}</span>{" "}
                {FINDING_TEXT[finding.problem]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card padded>
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="Previous tag" value={plan.previousTag ?? "none yet"} />
          <Fact label="Branch" value={plan.defaultBranch} />
          {/* The whole commit: a short hash is not the exact revision, and
              need not be unique in a repository this size (#519). */}
          <Fact label="Revision" value={plan.revision} />
        </dl>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="m-label">Releasing as</span>
            <span className="font-mono text-fg text-title">
              {plan.versions[step]}
            </span>
            {/* Maestro's proposal is a fact about the delta, so it stands
                unchanged beside whatever the author picks. */}
            <span className="font-ui text-desc text-muted">
              {`Maestro proposed ${plan.versions[plan.proposedStep]} — ${plan.reason}`}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="m-0 flex flex-col">
      <dt className="m-label mb-1.5">{label}</dt>
      <dd className="m-0 font-mono text-data text-fg">{value}</dd>
    </div>
  );
}
