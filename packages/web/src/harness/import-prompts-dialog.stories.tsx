import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImportPromptsDialog } from "./import-prompts-dialog";

const meta = {
  title: "Harness/ImportPromptsDialog",
  component: ImportPromptsDialog,
  args: {
    rows: [
      { key: "0", label: "release-notes", refusal: null, held: false },
      { key: "1", label: "standup-notes", refusal: null, held: false },
      { key: "2", label: "commit-tips", refusal: null, held: true },
      {
        key: "3",
        label: "onboarding",
        refusal: "empty-description",
        held: false,
      },
    ],
    checked: new Set(["0", "1"]),
    running: false,
    report: null,
    error: null,
    chooseFiles: async () => {},
    toggle: () => {},
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
