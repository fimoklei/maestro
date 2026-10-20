import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReleaseDelta } from "./release-delta";

const meta = {
  title: "Harness/ReleaseDelta",
  component: ReleaseDelta,
  args: {
    movements: [
      { type: "skill", kind: "added", name: "research", author: "Grace" },
      { type: "skill", kind: "changed", name: "tdd", author: "Ada" },
      {
        type: "skill",
        kind: "renamed",
        name: "test-first",
        previousName: "red-green",
        author: null,
      },
      { type: "skill", kind: "removed", name: "grilling", author: "Linus" },
    ],
  },
} satisfies Meta<typeof ReleaseDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryKind: Story = {};
