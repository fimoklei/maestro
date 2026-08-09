import type { ConnectOutcome } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectSuccessView } from "./connect-success-view";

const meta = {
  title: "Connect Gate/Success",
  component: ConnectSuccessView,
  args: {
    outcome: "found" as ConnectOutcome,
    primitiveCount: 7,
    inventoryPath: "/home/me/agent-harness",
    onContinue: () => undefined,
  },
} satisfies Meta<typeof ConnectSuccessView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Found: Story = {};

export const Joined: Story = {
  args: { outcome: "joined" },
};

export const Scaffolded: Story = {
  args: { outcome: "scaffolded", primitiveCount: 0 },
};
