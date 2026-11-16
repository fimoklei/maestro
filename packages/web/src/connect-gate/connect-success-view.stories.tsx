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
    copyOffer: null,
    copying: false,
    onContinue: () => undefined,
  },
} satisfies Meta<typeof ConnectSuccessView>;

const offer = { checked: true, onCheckedChange: () => undefined };

export default meta;

type Story = StoryObj<typeof meta>;

export const Found: Story = {};

export const Joined: Story = {
  args: { outcome: "joined" },
};

export const Scaffolded: Story = {
  args: { outcome: "scaffolded", primitiveCount: 0 },
};

// The released count could not be read, so the sentence names no number (#841).
export const CountUnread: Story = {
  args: { outcome: "found", primitiveCount: null },
};

// The latest release holds Harness categories: continue copies them.
export const CopyOffered: Story = { args: { copyOffer: offer } };

export const CopyCleared: Story = {
  args: { copyOffer: { ...offer, checked: false } },
};

export const Copying: Story = { args: { copyOffer: offer, copying: true } };
