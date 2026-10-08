import type { Meta, StoryObj } from "@storybook/react-vite";
import { RowMenu } from "./row-menu";

// Out of a row the trigger rests hidden; the decorator marks the row active.
const meta = {
  title: "Core/RowMenu",
  component: RowMenu,
  args: {
    label: "Actions for create-issue",
    tabStop: false,
    items: [
      { label: "Deploy skill", onSelect: () => {}, movesFocus: true },
      { label: "Update target", onSelect: () => {}, movesFocus: true },
      {
        label: "Remove skill",
        danger: true,
        onSelect: () => {},
        movesFocus: false,
      },
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

export const InTableRow: Story = {};

// A pane sub-list row is no grid: ⋮ is a Tab stop.
export const InSubListRow: Story = {
  args: { tabStop: true },
};
