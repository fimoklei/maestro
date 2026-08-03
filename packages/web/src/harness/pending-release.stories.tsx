import type { Meta, StoryObj } from "@storybook/react-vite";
import { PendingRelease } from "./pending-release";

const meta = {
  title: "Harness/PendingRelease",
  component: PendingRelease,
  args: {
    movements: [
      { kind: "added", name: "research", author: "Grace" },
      { kind: "changed", name: "tdd", author: "Ada" },
      {
        kind: "renamed",
        name: "test-first",
        previousName: "tdd-legacy",
        author: "Ada",
      },
      { kind: "removed", name: "grilling", author: "Linus" },
    ],
  },
} satisfies Meta<typeof PendingRelease>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EveryKind: Story = {};

// One kind of movement, one table: the ordinary day, and a first release.
export const AddedOnly: Story = {
  args: {
    movements: [
      { kind: "added", name: "impeccable", author: null },
      { kind: "added", name: "research", author: "Grace" },
      { kind: "added", name: "tdd", author: "Ada" },
    ],
  },
};
