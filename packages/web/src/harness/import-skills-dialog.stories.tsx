import type { SkillFolderScan } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImportSkillsDialog, skillFolderRow } from "./import-skills-dialog";

const SCAN = {
  folderBlocker: null,
  folders: [
    {
      entry: "code-review",
      name: "code-review",
      refusal: null,
      replaces: false,
    },
    {
      entry: "notes-helper",
      name: "notes-helper",
      refusal: "empty-description",
      replaces: false,
    },
    { entry: "review", name: "review", refusal: null, replaces: true },
    { entry: "tdd", name: "tdd", refusal: null, replaces: false },
  ],
} satisfies SkillFolderScan;

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
    checklist: {
      rows: SCAN.folders.map(skillFolderRow),
      checked: new Set(["code-review", "tdd"]),
      toggle: () => {},
      picked: [
        { key: "code-review", replace: false },
        { key: "tdd", replace: false },
      ],
    },
    isRunning: false,
    outcomes: null,
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
    checklist: { rows: null, checked: new Set(), toggle: () => {}, picked: [] },
  },
};

export const Reading: Story = {
  args: {
    load: { kind: "loading" },
    checklist: { rows: null, checked: new Set(), toggle: () => {}, picked: [] },
  },
};

export const Importing: Story = { args: { isRunning: true } };

export const Report: Story = {
  args: {
    outcomes: [
      {
        entry: "code-review",
        name: "code-review",
        refusal: null,
        replaces: false,
      },
      { entry: "review", name: "review", refusal: null, replaces: true },
      { entry: "tdd", name: "tdd", refusal: "source-changed", replaces: false },
      { entry: "lint", name: "lint", refusal: "name-taken", replaces: false },
    ],
  },
};
