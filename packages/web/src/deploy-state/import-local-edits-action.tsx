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
  // The reader's unchecks; every eligible skill starts checked.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const skills = check.data?.skills ?? null;
  const checked = new Set(
    (skills ?? [])
      .filter((skill) => skill.refusal === null && !unchecked.has(skill.name))
      .map((skill) => skill.name),
  );
  const outcomes =
    run.data?.outcomes.some((row) => row.refusal !== null) === true
      ? run.data.outcomes
      : null;

  return (
    <ImportLocalEditsDialog
      targetName={targetName}
      skills={skills}
      checked={checked}
      onToggle={(name) =>
        setUnchecked((current) => toggleStaged(current, name))
      }
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
          { target, names: [...checked] },
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
