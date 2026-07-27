import type { Meta, StoryObj } from "@storybook/react-vite";
import { RemoveSkillDialog } from "./remove-skill-dialog";

const meta = {
  title: "DeployState/RemoveSkillDialog",
  component: RemoveSkillDialog,
  args: {
    skillName: "tdd",
    repoPath: "/Users/me/acme-web",
    isRemoving: false,
    error: null,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof RemoveSkillDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

// The question as it is asked: both names in full, so two similar rows can be
// told apart before confirming.
export const Confirming: Story = {};

// Mid-removal: both controls are inert and the dialog cannot be dismissed, so
// the outcome cannot be missed.
export const Removing: Story = { args: { isRemoving: true } };

// A removal apm did not confirm. The dialog stays put, carries apm's own reason
// and warns that the repo may be half-changed.
export const Failed: Story = {
  args: { error: "apm did not confirm the removal. Check apm and try again." },
};
