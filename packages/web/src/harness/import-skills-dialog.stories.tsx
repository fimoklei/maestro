import type { SkillFolderScan } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RowCategoryControl } from "../categories/row-category-control";
import {
  type ImportRow,
  importChecklistGroups,
} from "./import-checklist-groups";
import { ImportSkillsDialog, skillFolderRow } from "./import-skills-dialog";
import type { ImportChecklist } from "./use-import-checklist";

const SCAN = {
  folderBlocker: null,
  folders: [
    {
      entry: "code-review",
      name: "code-review",
      refusal: null,
      replaces: false,
      category: "Code review",
    },
    {
      entry: "notes-helper",
      name: "notes-helper",
      refusal: "empty-description",
      replaces: false,
      category: null,
    },
    {
      entry: "review",
      name: "review",
      refusal: null,
      replaces: true,
      category: null,
    },
    {
      entry: "tdd",
      name: "tdd",
      refusal: null,
      replaces: false,
      category: null,
    },
  ],
} satisfies SkillFolderScan;

type Refusal = NonNullable<SkillFolderScan["folders"][number]["refusal"]>;

// A checklist frozen as listed: each row shows the category its file names.
const listed = (
  rows: readonly ImportRow<Refusal>[] | null,
  checked: readonly string[],
): ImportChecklist<Refusal> => ({
  rows,
  checked: new Set(checked),
  toggle: () => {},
  picked: checked.map((key) => ({ key, replace: false })),
  groups: (refusalSentence, isRunning) =>
    importChecklistGroups(rows ?? [], refusalSentence, (row) => ({
      control: (
        <RowCategoryControl
          name={row.name}
          value={row.fileCategory}
          open={false}
          disabled={isRunning}
          buttonRef={undefined}
          onToggle={() => {}}
        />
      ),
    })),
  categoryAdd: {
    run: async () => null,
    pending: false,
    failed: false,
    reset: () => {},
  },
  saveCategories: async () => [],
});

const meta = {
  title: "Harness/ImportSkillsDialog",
  component: ImportSkillsDialog,
  args: {
    source: "/Users/me/.claude/skills",
    sourceText: "/Users/me/.claude/skills",
    sourceError: undefined,
    onSourceChange: () => {},
    onSourceCommit: () => {},
    chooser: { available: true, busy: false, notice: null, browse: () => {} },
    load: { kind: "ready", scan: SCAN },
    checklist: listed(SCAN.folders.map(skillFolderRow), ["code-review", "tdd"]),
    isRunning: false,
    report: null,
    failure: null,
    onClose: () => {},
    onImport: () => {},
  },
} satisfies Meta<typeof ImportSkillsDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Listed: Story = {};

export const NoFolderChosen: Story = {
  args: {
    source: null,
    sourceText: "",
    load: { kind: "idle" },
    checklist: listed(null, []),
  },
};

export const Reading: Story = {
  args: {
    load: { kind: "loading" },
    checklist: listed(null, []),
  },
};

export const Importing: Story = { args: { isRunning: true } };

export const Report: Story = {
  args: {
    report: {
      outcomes: [
        {
          entry: "code-review",
          name: "code-review",
          refusal: null,
          replaces: false,
        },
        { entry: "review", name: "review", refusal: null, replaces: true },
        {
          entry: "tdd",
          name: "tdd",
          refusal: "source-changed",
          replaces: false,
        },
        { entry: "lint", name: "lint", refusal: "name-taken", replaces: false },
      ],
      unsavedCategories: [],
    },
  },
};
