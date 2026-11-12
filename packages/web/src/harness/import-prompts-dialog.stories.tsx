import type { Meta, StoryObj } from "@storybook/react-vite";
import { importChecklistGroups } from "./import-checklist-groups";
import { ImportPromptsDialog } from "./import-prompts-dialog";

const ROWS = [
  {
    key: "0",
    name: "release-notes",
    refusal: null,
    held: false,
    fileCategory: null,
  },
  {
    key: "1",
    name: "standup-notes",
    refusal: null,
    held: false,
    fileCategory: null,
  },
  {
    key: "2",
    name: "commit-tips",
    refusal: null,
    held: true,
    fileCategory: null,
  },
  {
    key: "3",
    name: "onboarding",
    refusal: "empty-description" as const,
    held: false,
    fileCategory: null,
  },
];

const meta = {
  title: "Harness/ImportPromptsDialog",
  component: ImportPromptsDialog,
  args: {
    checklist: {
      rows: ROWS,
      checked: new Set(["0", "1"]),
      toggle: () => {},
      picked: [
        { key: "0", replace: false },
        { key: "1", replace: false },
      ],
      groups: (refusalSentence) =>
        importChecklistGroups(ROWS, refusalSentence, () => ({})),
      categoryAdd: {
        run: async () => null,
        pending: false,
        failed: false,
        reset: () => {},
      },
      saveCategories: async () => [],
    },
    running: false,
    report: null,
    error: null,
    chooseFiles: async () => {},
    submit: () => {},
    close: () => {},
  },
} satisfies Meta<typeof ImportPromptsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checklist: Story = {};

export const Report: Story = {
  args: {
    report: [
      { name: "release-notes", imported: true, mode: "add" },
      { name: "commit-tips", imported: true, mode: "update" },
      { name: "standup-notes", imported: false, refusal: "prompt-taken" },
    ],
  },
};
