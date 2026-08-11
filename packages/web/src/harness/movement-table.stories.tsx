import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../ui/card";
import { MovementTable } from "./movement-table";

const meta = {
  title: "Harness/MovementTable",
  component: MovementTable,
  // The view always frames a section's rows in a card; the table alone would
  // document an edge it never has.
  decorators: [
    (Story) => (
      <Card>
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof MovementTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PendingReview: Story = {
  args: {
    movements: [
      { skill: "code-review", state: "pending-review", deletion: false },
      { skill: "test-helper", state: "pending-review", deletion: false },
    ],
  },
};

export const PendingPromotion: Story = {
  args: {
    movements: [
      { skill: "lint-rules", state: "pending-promotion", deletion: false },
      { skill: "tdd", state: "pending-promotion", deletion: true },
    ],
  },
};

// A name long enough to overflow the narrow table must still leave room for the
// deletion chip: the name truncates, the chip stays (#575).
export const LongNameDeletion: Story = {
  args: {
    movements: [
      {
        skill: "a-very-long-unbroken-skill-name-that-would-overflow-the-cell",
        state: "pending-promotion",
        deletion: true,
      },
    ],
  },
};
