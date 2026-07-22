import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeployedCell } from "./deployed-cell";

// The deployed column's meaningful states (#272): a plain reach count, the ▲N
// drift chip, the separate ? unknown marker, and the explicit "not deployed".
const meta = {
  title: "Inventory/DeployedCell",
  component: DeployedCell,
  args: { rollup: { targetCount: 3, behindCount: 0, unknownCount: 0 } },
} satisfies Meta<typeof DeployedCell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Deployed: Story = {};

export const NotDeployed: Story = {
  args: { rollup: { targetCount: 0, behindCount: 0, unknownCount: 0 } },
};

// Reach unconfirmed while the local reads are in flight — holds off on the
// definite "not deployed" (J04).
export const Resolving: Story = {
  args: {
    rollup: { targetCount: 0, behindCount: 0, unknownCount: 0, pending: true },
  },
};

export const Behind: Story = {
  args: { rollup: { targetCount: 4, behindCount: 2, unknownCount: 0 } },
};

// A confirmed lower bound while some reads are unresolved — the trailing …
// keeps the count from reading as a final, complete reach (J04).
export const PartiallyRead: Story = {
  args: {
    rollup: {
      targetCount: 2,
      behindCount: 0,
      unknownCount: 0,
      unreadable: true,
    },
  },
};

export const BehindAndUnknown: Story = {
  args: { rollup: { targetCount: 5, behindCount: 2, unknownCount: 1 } },
};

// A deployed skill whose version check is still running — the marker keeps the
// row's silence from reading as "up-to-date everywhere" (J04).
export const Checking: Story = {
  args: {
    rollup: { targetCount: 2, behindCount: 0, unknownCount: 0, checking: true },
  },
};
