import type { Meta, StoryObj } from "@storybook/react-vite";
import { RestoreDialog } from "./restore-dialog";

const meta = {
  title: "Harness/RestoreDialog",
  component: RestoreDialog,
  args: {
    skill: "old-skill",
    folder: ".apm/skills/old-skill",
    commit: "9f2c1b7a3d4e5f60718293a4b5c6d7e8f9012345",
    hasRequest: false,
    onClose: () => {},
    onConfirm: () => {},
    restoring: false,
    restoreError: null,
  },
} satisfies Meta<typeof RestoreDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

// A deletion already proposed: the restore writes the working tree only, so
// the open pull request stays exactly as it is.
export const WithOpenProposal: Story = {
  args: { hasRequest: true },
};

export const Restoring: Story = {
  args: { restoring: true },
};

// The author staged something over this skill. Maestro never moves the index,
// so the way on is theirs — the dialog stays, the press stays.
export const Refused: Story = {
  args: {
    restoreError: {
      level: "error",
      label: "Skill has staged changes",
      message:
        "Nothing was restored. Unstage this skill in your Git tool, then Restore skill again.",
      detail: "Maestro never changes what you staged.",
    },
  },
};
