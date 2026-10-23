import type { Meta, StoryObj } from "@storybook/react-vite";
import { Filter, RefreshCw, SlidersHorizontal } from "lucide-react";
import { IconButton } from "./icon-button";

const meta = {
  title: "Core/IconButton",
  component: IconButton,
  args: {
    label: "Re-read Skills",
    children: <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />,
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Keeps its plain label; the empty state beside it says why.
export const Unavailable: Story = {
  args: { label: "Filter", unavailable: { describedBy: "empty-state" } },
  render: (args) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <IconButton {...args}>
        <Filter aria-hidden="true" size={16} strokeWidth={1.5} />
      </IconButton>
      <span id="empty-state">No skills yet</span>
    </div>
  ),
};

export const InBandTwo: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <IconButton label="Re-read Skills">
        <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
      </IconButton>
      <IconButton label="Filter">
        <Filter aria-hidden="true" size={16} strokeWidth={1.5} />
      </IconButton>
      <IconButton label="Display">
        <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={1.5} />
      </IconButton>
    </div>
  ),
};
