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

// The ordinary day for most harnesses: one kind of movement, one table.
export const AddedOnly: Story = {
  args: {
    movements: [
      { kind: "added", name: "research", author: "Grace" },
      { kind: "added", name: "impeccable", author: null },
    ],
  },
};

// A first release: the whole remote skill set is the delta.
export const FirstRelease: Story = {
  args: {
    movements: [
      { kind: "added", name: "grilling", author: "Linus" },
      { kind: "added", name: "research", author: "Grace" },
      { kind: "added", name: "tdd", author: "Ada" },
    ],
  },
};
