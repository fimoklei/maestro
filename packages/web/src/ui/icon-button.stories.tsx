import type { Meta, StoryObj } from "@storybook/react-vite";
import { Filter, RefreshCw, SlidersHorizontal } from "lucide-react";
import { IconButton } from "./icon-button";

const meta = {
  title: "Core/IconButton",
  component: IconButton,
  args: {
    label: "Re-read Inventory",
    children: <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />,
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unavailable: Story = {
  args: { unavailable: "No Harness connected" },
};

export const InBandTwo: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <IconButton label="Re-read Inventory">
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
