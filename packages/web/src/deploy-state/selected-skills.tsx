import { type Ref, useEffect, useState } from "react";
import {
  type DriftViewModel,
  driftViewModel,
  lagsPin,
} from "../drift/drift-view-model";
import { GitHubMarkLink } from "../ui/github-mark-link";
import { SubListRow } from "../ui/sub-list-row";
import {
  HARNESS_ORIGIN_NOT_READ,
  VIEW_SKILL_ON_GITHUB,
} from "./deploy-state-copy";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { RemoveSkillFlow } from "./remove-skill-flow";
import { skillMark } from "./skill-mark";
import type { DeployedPrimitive } from "./use-deploy-state";

// Pending default avoids a spurious mark before the drift query resolves.
const PENDING_DRIFT = driftViewModel({ data: undefined, isError: false });

export function SelectedSkills({
  primitives,
  drift = PENDING_DRIFT,
  target,
  targetName,
  onRemoved,
  headingRef,
}: {
  primitives: DeployedPrimitive[];
  drift?: DriftViewModel;
  // Required: a global target's tools must be present or the confirmation can't render.
  target: RemoveDialogTarget;
  /** The target as the table names it, for the removal's toast. */
  targetName: string;
  // Called after the dialog is gone: a successful removal destroys the trigger
  // the modal's own focus-restore would aim at.
  onRemoved?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [justRemoved, setJustRemoved] = useState(false);

  // In an effect, not the success handler: the modal's focus-restore runs
  // during its unmount and would overwrite an earlier move.
  useEffect(() => {
    if (justRemoved) {
      setJustRemoved(false);
      onRemoved?.();
    }
  }, [justRemoved, onRemoved]);

  const orphans = drift.orphanBehind(
    primitives.map((primitive) => primitive.name),
  );

  return (
    <section className="mt-section">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="m-0 mb-inline font-normal text-gray-11 text-meta focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
      >
        Selected skills{" "}
        <span className="text-gray-12 tabular-nums">{primitives.length}</span>
      </h3>
      <ul className="m-0 list-none border-divider border-t p-0">
        {primitives.map((primitive) => {
          const status = drift.skillStatus(primitive.name);
          const latest = drift.latest(primitive.name);
          return (
            <SubListRow
              key={primitive.name}
              mark={skillMark(primitive.copy, status)}
              name={primitive.name}
              value={
                lagsPin(status) && latest
                  ? `${primitive.version} → ${latest}`
                  : primitive.version
              }
              menuLabel={`Actions for ${primitive.name}`}
              link={
                <GitHubMarkLink
                  page={primitive.github}
                  name={primitive.name}
                  unknownCause={HARNESS_ORIGIN_NOT_READ}
                />
              }
              items={[
                // The link cell is mouse only; this is the keyboard's way.
                ...(primitive.github?.kind === "link"
                  ? [
                      {
                        label: VIEW_SKILL_ON_GITHUB,
                        href: primitive.github.url,
                      },
                    ]
                  : []),
                {
                  label: "Remove skill",
                  danger: true,
                  onSelect: () => setRemoving(primitive.name),
                },
              ]}
            />
          );
        })}
      </ul>
      {removing !== null ? (
        <RemoveSkillFlow
          key={removing}
          skillName={removing}
          version={
            primitives.find((primitive) => primitive.name === removing)
              ?.version ?? null
          }
          target={target}
          targetName={targetName}
          onCancel={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null);
            setJustRemoved(true);
          }}
        />
      ) : null}
      {orphans.length > 0 && (
        <p className="mt-inline text-amber-12 text-meta">
          Reported behind, not deployed here: {orphans.join(", ")}
        </p>
      )}
    </section>
  );
}
