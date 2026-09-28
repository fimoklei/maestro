import { useState } from "react";
import { useNavigate } from "react-router";
import { toggleStaged } from "../inventory/bulk-selection";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import { showSuccess } from "../ui/toast";
import {
  importedToast,
  localEditsCheckNotice,
  localEditsImportNotice,
} from "./import-local-edits-copy";
import { ImportLocalEditsDialog } from "./import-local-edits-dialog";
import {
  useImportLocalEdits,
  useLocalEditsCheck,
} from "./use-import-local-edits";

// Every skill landed: the Harness screen, where Propose change lives, takes
// over. One skill opens its row; several show in place, named by a toast.
export function ImportLocalEditsAction({
  targetName,
  target,
  onClose,
}: {
  targetName: string;
  target: DeployTarget;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const check = useLocalEditsCheck(target, true);
  const run = useImportLocalEdits();
  // The reader's toggles: an eligible skill starts checked, one that undoes
  // newer Harness changes unchecked.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const skills = check.data?.skills ?? null;
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
      onToggle={(name) => setToggled((current) => toggleStaged(current, name))}
      isRunning={run.isPending}
      outcomes={outcomes}
      failure={
        check.isError
          ? localEditsCheckNotice(check.error)
          : localEditsImportNotice(run.error)
      }
      onCancel={onClose}
      onConfirm={() =>
        run.mutate(
          {
            target,
            names: [...checked],
            undo: picked
              .filter((skill) => skill.undoesNewerSince !== undefined)
              .map((skill) => skill.name),
          },
          {
            onSuccess: ({ outcomes: landed }) => {
              if (landed.some((row) => row.refusal !== null)) return;
              const names = landed.map((row) => row.name);
              onClose();
              navigate("/harness", {
                state: names.length === 1 ? { openSkill: names[0] } : null,
              });
              if (names.length > 1) showSuccess(importedToast(names));
            },
          },
        )
      }
    />
  );
}
