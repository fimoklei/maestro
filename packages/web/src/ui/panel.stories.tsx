import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { Panel } from "./panel";

const meta = {
  title: "Shell/Panel",
  component: Panel,
  args: {
    title: "Deploy-state",
    children: <div className="p-panel">rows</div>,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OneBand: Story = {};

export const WithPrimaryAction: Story = {
  args: {
    meta: "12 targets",
    action: <Button variant="primary">Deploy skill</Button>,
  },
};

export const TwoBands: Story = {
  args: {
    meta: "12 targets",
    action: <Button variant="primary">Deploy skill</Button>,
    band2: (
      <>
        <span className="ml-auto text-gray-11 text-meta">Read just now</span>
        <IconButton label="Re-read Deploy-state">
          <RefreshCw aria-hidden="true" size={16} strokeWidth={1.5} />
        </IconButton>
      </>
    ),
  },
};
