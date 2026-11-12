import type { Meta, StoryObj } from "@storybook/react-vite";
import { CATEGORY_FIELD } from "../categories/categories-copy";
import { ImportPromptsDialog } from "./import-prompts-dialog";

const IDLE_ADD = {
  run: async () => null,
  pending: false,
  failed: false,
  reset: () => {},
};

const ROWS = [
  {
    key: "0",
    name: "release-notes",
    refusal: null,
    held: false,
    fileCategory: "Docs",
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
    source: "files",
    switchSource: () => {},
    pasted: {
      draft: {
        name: "",
        frontmatter: "",
        description: "",
        text: "",
        example: "",
      },
      fieldErrors: {},
      part: "text",
      showPart: () => {},
      changed: false,
      leaveName: () => {},
      paste: () => false,
      edit: () => {},
      category: null,
      failure: null,
    },
    checklist: {
      rows: ROWS,
      checked: new Set(["0", "1"]),
      toggle: () => {},
      picked: [
        { key: "0", replace: false },
        { key: "1", replace: false },
      ],
      // Each row shows the category its file names.
      rowCategory: (row) =>
        row.refusal === null
          ? {
              name: row.name,
              value: row.fileCategory,
              suggested: null,
              open: false,
              addFailed: false,
              add: IDLE_ADD,
              buttonRef: undefined,
              toggleMenu: () => {},
              pick: () => {},
              closeMenu: () => {},
            }
          : null,
      categoryAdd: IDLE_ADD,
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

export const PasteText: Story = {
  args: {
    source: "paste",
    pasted: {
      ...meta.args.pasted,
      draft: {
        name: "handoff-note",
        frontmatter: "",
        description: "Write a handoff note for the next agent.",
        text: "Summarise what you changed, what is still open, and the next step.",
        example: "",
      },
      changed: true,
      category: {
        value: null,
        hint: CATEGORY_FIELD.hint,
        suggested: null,
        onChange: () => {},
        add: meta.args.checklist.categoryAdd,
      },
    },
    checklist: {
      ...meta.args.checklist,
      rows: [
        {
          key: "pasted",
          name: "handoff-note",
          refusal: null,
          held: false,
          fileCategory: null,
        },
      ],
      checked: new Set(["pasted"]),
    },
  },
};

export const Report: Story = {
  args: {
    report: {
      outcomes: [
        { name: "release-notes", imported: true, mode: "add" },
        { name: "commit-tips", imported: true, mode: "update" },
        { name: "standup-notes", imported: false, refusal: "prompt-taken" },
      ],
      unsavedCategories: [],
    },
  },
};
