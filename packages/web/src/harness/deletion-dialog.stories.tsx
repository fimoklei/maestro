import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeletionDialog } from "./deletion-dialog";

const meta = {
  title: "Harness/DeletionDialog",
  component: DeletionDialog,
  args: {
    skill: "old-skill",
    origin: "github.com/fimoklei/agent-harness",
    seenRemoteTree: "9f2c1b7a3d4e5f60718293a4b5c6d7e8f9012345",
    onClose: () => {},
    onConfirm: () => {},
    removing: false,
    removeError: null,
  },
} satisfies Meta<typeof DeletionDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Removing: Story = {
  args: { removing: true },
};

// The remote moved under the confirmation, so it is refused and the author is
// asked for a new one — the dialog stays, the press stays.
export const ConfirmationRefused: Story = {
  args: {
    removeError:
      "The skill on the default branch is no longer the one you confirmed removing. Nothing was pushed — refresh and confirm again.",
  },
};

// An incomplete working tree must not masquerade as intent, so the removal is
// refused before anything is pushed.
export const WorkingTreeAmbiguous: Story = {
  args: {
    removeError:
      "A merge is in progress in the Harness clone. Finish or abort it, then confirm the removal again.",
  },
};
