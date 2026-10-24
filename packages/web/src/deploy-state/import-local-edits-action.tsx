import { useState } from "react";
import { useNavigate } from "react-router";
import { type HarnessArrival, proposalRow } from "../harness/harness-route";
import { toggleStaged } from "../inventory/bulk-selection";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { useScreenReport, useWriteAction } from "../ui/use-write-action";
import {
  localEditsCheckNotice,
  localEditsImportNotice,
} from "./import-local-edits-copy";
import { ImportLocalEditsDialog } from "./import-local-edits-dialog";
import {
  useImportLocalEdits,
  useLocalEditsCheck,
} from "./use-import-local-edits";

const skillRef = (name: string) => ({ type: "skill" as const, name });

// Every skill landed: the Harness screen, where Propose change lives, takes
// over. One skill opens its row; several show in place.
export function ImportLocalEditsAction({
  targetName,
  target,
  only,
  onClose,
}: {
  targetName: string;
  target: DeployTarget;
  /** One skill's name to scope the dialog to it; null lists the whole target. */
  only: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const check = useLocalEditsCheck(target);
  const run = useImportLocalEdits();
  // A refusal shows in the dialog's outcome; a landing is said on the Harness
  // screen, one skill there with its row open.
  const importWrite = useWriteAction(run, {
    report: useScreenReport(),
    action: "import",
    subject: ({ outcomes: landed }) => {
      if (landed.some((row) => row.refusal !== null)) return null;
      const [one] = landed;
      return landed.length === 1 && one !== undefined
        ? { name: one.name, row: proposalRow(skillRef(one.name)) }
        : { name: { count: landed.length, things: "skills" }, row: null };
    },
    handOver: (written, { outcomes: landed }) => {
      const [one] = landed;
      onClose();
      navigate("/harness", {
        state: {
          openPrimitive:
            landed.length === 1 && one !== undefined
              ? skillRef(one.name)
              : undefined,
          written,
        } satisfies HarnessArrival,
      });
    },
    failure: localEditsImportNotice,
  });
  // The reader's toggles: an eligible skill starts checked, one that undoes
  // newer Harness changes unchecked.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const skills =
    check.data?.skills.filter(
      (skill) => only === null || skill.name === only,
    ) ?? null;
  const picked = (skills ?? []).filter(
    (skill) =>
      skill.refusal === null &&
      (skill.undoesNewerSince === undefined) !== toggled.has(skill.name),
  );
  const checked = new Set(picked.map((skill) => skill.name));
  const outcomes =
    run.data?.outcomes.some((row) => row.refusal !== null) === true
      ? run.data.outcomes
      : null;

  return (
    <ImportLocalEditsDialog
      targetName={targetName}
      skills={skills}
      checked={checked}
      checksChanged={toggled.size > 0}
      onToggle={(name) => setToggled((current) => toggleStaged(current, name))}
      isRunning={importWrite.phase === "running"}
      outcomes={outcomes}
      failure={
        check.isError ? localEditsCheckNotice(check.error) : importWrite.failure
      }
      onCancel={onClose}
      onConfirm={() =>
        importWrite.run({
          target,
          names: [...checked],
          undo: picked
            .filter((skill) => skill.undoesNewerSince !== undefined)
            .map((skill) => skill.name),
        })
      }
    />
  );
}
