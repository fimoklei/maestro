import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImportSkillsDialog } from "./import-skills-dialog";

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
    load: {
      kind: "ready",
      scan: {
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
      },
    },
    checked: new Set(["code-review", "tdd"]),
    onToggle: () => {},
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
    checked: new Set(),
  },
};

export const Reading: Story = { args: { load: { kind: "loading" } } };

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
