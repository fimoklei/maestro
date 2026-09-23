import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeletionDialog } from "./deletion-dialog";

const meta = {
  title: "Harness/DeletionDialog",
  component: DeletionDialog,
  args: {
    skill: "old-skill",
    mode: {
      kind: "propose",
      origin: "github.com/fimoklei/agent-harness",
      seenRemoteTree: "9f2c1b7a3d4e5f60718293a4b5c6d7e8f9012345",
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
  args: { mode: { kind: "local", folder: ".apm/skills/old-skill" } },
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
