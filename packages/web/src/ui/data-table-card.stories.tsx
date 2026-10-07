import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "./chip";
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
    content: { ...meta.args.content, value: null },
  },
};

export const WithoutReadAge: Story = {
  args: {
    content: { ...meta.args.content, readAge: null },
  },
};

// A secondary column's card: no badge, a sentence alone.
export const WithoutReading: Story = {
  args: {
    content: {
      body: [
        "This change adds release-notes to github.com/fimoklei/agent-harness.",
      ],
      readAge: null,
    },
    children: <span>Addition</span>,
  },
};

export const WithFacts: Story = {
  args: {
    content: {
      value: (
        <>
          <MachineValue>#47</MachineValue>
          <Chip>Open</Chip>
        </>
      ),
      facts: [
        { label: "Review", value: "Changes requested" },
        { label: "Requested", value: "@sanne, @joris" },
        {
          label: "Branch",
          value: <MachineValue>maestro/code-review → main</MachineValue>,
        },
      ],
      readAge: null,
    },
    children: <MachineValue>#47</MachineValue>,
  },
};
