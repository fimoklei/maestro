import type { Meta, StoryObj } from "@storybook/react-vite";
import { RowMenu } from "./row-menu";

// Out of a row the trigger rests hidden; hover the corner to reveal it.
const meta = {
  title: "Inventory/RowMenu",
  component: RowMenu,
  args: {
    name: "create-issue",
    onAction: () => {},
    items: [
      { action: "deploy", label: "Deploy skill" },
      { action: "update", label: "Update target" },
      { action: "remove", label: "Remove skill" },
    ],
  },
  decorators: [
    (Story) => (
      <div className="group/row" data-active>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RowMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
