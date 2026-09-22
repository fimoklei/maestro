import type { Meta, StoryObj } from "@storybook/react-vite";
import { HoverCard } from "./hover-card";
import { StatusBadge } from "./status-badge";
import { reading } from "./status-reading";

// Open on focus, so the card shows without a hover.
const meta = {
  title: "Core/HoverCard",
  component: HoverCard,
  args: {
    focused: true,
    content: <p className="m-0">Deployed to 2 targets</p>,
    children: (
      <span>
        <StatusBadge reading={reading("Up to date", "good")} />
      </span>
    ),
  },
} satisfies Meta<typeof HoverCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};
