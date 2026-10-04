import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeletionDialog } from "./deletion-dialog";

const meta = {
  title: "Harness/DeletionDialog",
  component: DeletionDialog,
  args: {
    skill: "old-skill",
    mode: {
      kind: "propose",
      seenRemoteTree: "9f2c1b7a3d4e5f60718293a4b5c6d7e8f9012345",
      openRequest: null,
    },
    onClose: () => {},
    onConfirm: () => {},
    deleting: false,
    deleteError: null,
  },
} satisfies Meta<typeof DeletionDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

// The other road: the skill exists nowhere else, so there is no deletion to
// propose and the folder goes from disk.
export const LocalOnly: Story = {
  args: {
    mode: {
      kind: "local",
      folder: ".apm/skills/old-skill",
      check: "ready",
      localOnly: true,
      uncommitted: true,
    },
  },
};

// Step 1 of deleting a skill on the default branch: the folder leaves the
// clone, and Propose change carries the deletion on.
export const StepOne: Story = {
  args: {
    mode: {
      kind: "local",
      folder: ".apm/skills/old-skill",
      check: "ready",
      localOnly: false,
      uncommitted: false,
    },
  },
};

export const StepOneUncommitted: Story = {
  args: {
    mode: {
      kind: "local",
      folder: ".apm/skills/old-skill",
      check: "ready",
      localOnly: false,
      uncommitted: true,
    },
  },
};

// The folder is read afresh on every opening; Delete skill waits for it.
export const LocalChecking: Story = {
  args: {
    mode: {
      kind: "local",
      folder: ".apm/skills/old-skill",
      check: "checking",
      localOnly: false,
      uncommitted: false,
    },
  },
};

// An open pull request on the proposal branch, possibly a teammate's, becomes
// the deletion.
export const OverOpenRequest: Story = {
  args: {
    mode: {
      kind: "propose",
      seenRemoteTree: "9f2c1b7a3d4e5f60718293a4b5c6d7e8f9012345",
      openRequest: { number: 45, author: "teammate-login" },
    },
  },
};

export const Deleting: Story = {
  args: { deleting: true },
};

// The remote moved under the confirmation, so it is refused and the author is
// asked for a new one — the dialog stays, the press stays.
export const ConfirmationRefused: Story = {
  args: {
    deleteError: {
      level: "error",
      label: "Confirmation out of date",
      message:
        "Nothing was pushed. Select Re-read Harness, then Delete skill again.",
      detail: "The copy on the default branch moved after this confirmation.",
    },
  },
};

// An incomplete working tree must not masquerade as intent, so the deletion is
// refused before anything is pushed.
export const WorkingTreeAmbiguous: Story = {
  args: {
    deleteError: {
      level: "error",
      label: "Unfinished merge",
      message:
        "Nothing was pushed. Finish or abort the merge, then Delete skill again.",
      detail: "A half-merged working tree does not state what should go.",
    },
  },
};
