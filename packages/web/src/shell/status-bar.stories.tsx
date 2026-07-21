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

// Connected with the inventory-source entry shown in the header (issue #109):
// the source name + count as context text, and the ⚙ gear that opens /source.
export const ConnectedWithSource: Story = {
  args: {
    source: {
      name: "…/Projects/agent-harness",
      title: "/Users/me/Projects/agent-harness",
      countLabel: "9 primitives",
      active: false,
      onOpen: () => {},
    },
  },
};

// On the source route the gear reads as the active view (amber).
export const ViewingSource: Story = {
  args: {
    source: {
      name: "…/Projects/agent-harness",
      title: "/Users/me/Projects/agent-harness",
      countLabel: "9 primitives",
      active: true,
      onOpen: () => {},
    },
  },
};

export const SetupRequired: Story = { args: { connection: "setup-required" } };

export const Disconnected: Story = { args: { connection: "disconnected" } };

export const Connecting: Story = { args: { connection: "checking" } };
