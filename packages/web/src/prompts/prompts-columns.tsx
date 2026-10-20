import type { InventoryPrompt } from "@maestro/core";
import { createDataTableColumns } from "../ui/data-table";
import { MachineValue } from "../ui/machine-value";
import { RowMenu } from "../ui/row-menu";
import { ACTIONS_COLUMN_ID } from "../ui/row-menu-control";
import { ACTIONS_COLUMN_LABEL, rowActionsLabel } from "../ui/row-menu-copy";
import { WARNING_GLYPH } from "../ui/status-family";
import { reading } from "../ui/status-reading";
import { NAME_NOT_VALID, NAME_RULE } from "./prompts-copy";

export type RowAction = "copy";

/** One Prompts row: the released prompt, its ⋮ items and the read age its hover card ends with. */
export type PromptRow = InventoryPrompt & {
  /** The ⋮ menu's items, in order. */
  actions: { action: RowAction; label: string }[];
  readAge: string | null;
};

const NAME_NOT_VALID_READING = reading(
  NAME_NOT_VALID,
  "attention",
  WARNING_GLYPH,
);

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const promptsColumns = ({
  onAction,
}: {
  onAction: (row: PromptRow, action: RowAction) => void;
}) =>
  createDataTableColumns<PromptRow>((helper) => [
    {
      ...helper.accessor("name", { header: "Name" }),
      name: (row) => row.name,
      nameMark: (row) => (row.nameValid ? null : NAME_NOT_VALID_READING),
      // Only a badly named file has something to say.
      card: {
        keyboard: true,
        content: (row) =>
          row.nameValid
            ? null
            : {
                reading: NAME_NOT_VALID_READING,
                value: <MachineValue>{fileName(row.path)}</MachineValue>,
                body: [NAME_RULE],
                readAge: row.readAge,
              },
      },
    },
    helper.accessor("description", {
      header: "Description",
      meta: { className: "text-gray-11", width: 128, priority: 1 },
    }),
    helper.display({
      id: ACTIONS_COLUMN_ID,
      header: () => <span className="sr-only">{ACTIONS_COLUMN_LABEL}</span>,
      cell: ({ row }) => (
        <RowMenu
          label={rowActionsLabel(row.original.name)}
          items={row.original.actions.map(({ action, ...item }) => ({
            ...item,
            movesFocus: false,
            onSelect: () => onAction(row.original, action),
          }))}
          tabStop={false}
          busy={false}
        />
      ),
      meta: { width: 10 },
    }),
  ]);

export const DISPLAY_OPTIONS = [{ value: "description", label: "Description" }];
