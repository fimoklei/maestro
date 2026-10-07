import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTableCard } from "./data-table-card";
import { MachineValue } from "./machine-value";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

const BEHIND = reading("Behind", "attention");

// Open on focus, so the card shows without a hover.
const meta = {
  title: "Core/DataTableCard",
  component: DataTableCard,
  args: {
    focused: true,
    content: {
      reading: BEHIND,
      value: <MachineValue>v0.3.2</MachineValue>,
      body: [
        "2 of 5 deployed skills changed in v0.3.4. Select Update target to move this target to v0.3.4.",
      ],
      readAge: "Read 4 min ago",
    },
    children: <StatusBadge reading={BEHIND} />,
  },
} satisfies Meta<typeof DataTableCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithValueAndReadAge: Story = {};

export const WithoutValue: Story = {
  args: {
    content: { ...meta.args.content, value: undefined },
  },
};

export const WithoutReadAge: Story = {
  args: {
    content: { ...meta.args.content, readAge: undefined },
  },
};
