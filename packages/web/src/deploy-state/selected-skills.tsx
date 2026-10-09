import { type Ref, useEffect, useState } from "react";
import { lagsPin } from "../drift/drift-view-model";
import { IMPORT_LOCAL_EDITS, REMOVE_SKILL } from "../ui/control-labels";
import { Notice } from "../ui/notice";
import { SubListHeading } from "../ui/sub-list-heading";
import { SubListRow } from "../ui/sub-list-row";
import { packageBehindNotice, VIEW_SKILL_ON_GITHUB } from "./deploy-state-copy";
import { ImportLocalEditsAction } from "./import-local-edits-action";

import { RemoveSkillFlow } from "./remove-skill-flow";
import { skillMark } from "./skill-mark";
import { canImportLocalEdits, type TargetRow } from "./target-rows";

type SkillsRow = Pick<
  TargetRow,
  "primitives" | "drift" | "target" | "wire" | "name" | "updateName" | "pending"
>;

type OpenDialog = { kind: "remove" | "import"; name: string };

export function SelectedSkills({
  row,
  onRemoved,
  headingRef,
}: {
  row: SkillsRow;
  // Called after the dialog is gone: a successful removal destroys the trigger
  // the modal's own focus-restore would aim at.
  onRemoved?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const { primitives, drift } = row;
  const [open, setOpen] = useState<OpenDialog | null>(null);
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
    <section>
      <SubListHeading
        label="Deployed skills"
        count={primitives.length}
        headingRef={headingRef}
      />
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
              items={[
                ...(primitive.github?.kind === "link"
                  ? [
                      {
                        label: VIEW_SKILL_ON_GITHUB,
                        href: primitive.github.url,
                      },
                    ]
                  : []),
                ...(canImportLocalEdits(row.pending, primitive)
                  ? [
                      {
                        label: IMPORT_LOCAL_EDITS,
                        onSelect: () =>
                          setOpen({ kind: "import", name: primitive.name }),
                      },
                    ]
                  : []),
                {
                  label: REMOVE_SKILL,
                  danger: true,
                  onSelect: () =>
                    setOpen({ kind: "remove", name: primitive.name }),
                },
              ]}
            />
          );
        })}
      </ul>
      {open?.kind === "remove" ? (
        <RemoveSkillFlow
          key={open.name}
          skillName={open.name}
          version={
            primitives.find((primitive) => primitive.name === open.name)
              ?.version ?? null
          }
          target={row.target}
          targetName={row.name}
          onCancel={() => setOpen(null)}
          onRemoved={() => {
            setOpen(null);
            setJustRemoved(true);
          }}
        />
      ) : null}
      {open?.kind === "import" ? (
        <ImportLocalEditsAction
          key={open.name}
          targetName={row.updateName}
          target={row.wire}
          only={open.name}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {orphans.length > 0 && (
        <div className="mt-inline">
          <Notice trigger="load" notice={packageBehindNotice(orphans)} />
        </div>
      )}
    </section>
  );
}
