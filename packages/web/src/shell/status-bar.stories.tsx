import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBarView } from "./status-bar";

const meta = {
  title: "Shell/StatusBar",
  component: StatusBarView,
  args: { connection: "connected" },
  argTypes: {
    connection: {
      control: "inline-radio",
      options: ["checking", "setup-required", "connected", "disconnected"],
    },
  },
} satisfies Meta<typeof StatusBarView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

// Connected with the inventory-source entry shown in the header (issue #109).
export const ConnectedWithSource: Story = {
  args: {
    source: {
      name: "agent-harness",
      countLabel: "9 primitives",
      onOpen: () => {},
    },
  },
};

export const SetupRequired: Story = { args: { connection: "setup-required" } };

export const Disconnected: Story = { args: { connection: "disconnected" } };

export const Connecting: Story = { args: { connection: "checking" } };
