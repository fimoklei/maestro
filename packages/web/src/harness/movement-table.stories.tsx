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
      { skill: "code-review", state: "pending-review" },
      { skill: "test-helper", state: "pending-review" },
    ],
  },
};

export const PendingPromotion: Story = {
  args: { movements: [{ skill: "lint-rules", state: "pending-promotion" }] },
};
