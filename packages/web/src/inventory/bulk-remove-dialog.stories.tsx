import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkRemoveDialog } from "./bulk-remove-dialog";

// One story per state this ticket ships (#422). The grouped body and the
// per-target report arrive with their own tickets and their own stories.
const meta = {
  title: "Inventory/BulkRemoveDialog",
  component: BulkRemoveDialog,
  args: {
    skillName: "tdd",
    targetCount: 4,
    answeredCount: 4,
    isRemoving: false,
    error: null,
    onCancel: () => {},
    onConfirm: () => {},
  },
} satisfies Meta<typeof BulkRemoveDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

// Every check has answered, so the confirm is on offer.
export const Ready: Story = {};

// Checks still running: the count climbs and the confirm is held.
export const Checking: Story = {
  args: { answeredCount: 1 },
};

// Mid-run: both controls dead, escape and backdrop blocked.
export const Running: Story = {
  args: { isRemoving: true },
};

// The request never reached the server, so nothing was removed anywhere.
export const RequestFailed: Story = {
  args: {
    error:
      "Maestro could not reach its server, so nothing was removed anywhere. Try again.",
  },
};
