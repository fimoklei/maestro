import type { Meta, StoryObj } from "@storybook/react-vite";
import { CountedLabel } from "./counted-label";

const meta = {
  title: "Core/CountedLabel",
  component: CountedLabel,
  args: { label: "Pending release", count: 3 },
  decorators: [
    (Story) => (
      <span className="text-gray-11 text-meta">
        <Story />
      </span>
    ),
  ],
} satisfies Meta<typeof CountedLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Counted: Story = {};

export const Uncounted: Story = { args: { count: null } };
