import type { Meta, StoryObj } from "@storybook/react-vite";
import { Fact } from "./fact";

const meta = {
  title: "Shell/Fact",
  component: Fact,
  args: { label: "Branch", value: "main" },
  decorators: [
    (Story) => (
      <dl className="m-0 flex max-w-[320px] flex-wrap gap-x-10 gap-y-3">
        <Story />
      </dl>
    ),
  ],
} satisfies Meta<typeof Fact>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A full commit or tree hash has no break in it, so it needs one made.
export const Wrapping: Story = {
  args: {
    label: "Revision",
    value: "9f1c2b7a4e5d6c8b0a1f2e3d4c5b6a7980112233",
    wrap: true,
  },
};
