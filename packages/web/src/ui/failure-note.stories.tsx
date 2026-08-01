import type { Meta, StoryObj } from "@storybook/react-vite";
import { FailureNote } from "./failure-note";

const meta = {
  title: "UI/FailureNote",
  component: FailureNote,
  args: {
    label: "the run never started",
    message: "Malformed request. Nothing was removed anywhere. Try again.",
  },
} satisfies Meta<typeof FailureNote>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A property of the control beside it, not a second problem.
export const WithAside: Story = {
  args: {
    label: "the removal failed",
    message: "apm could not remove the deployed copy.",
    children: (
      <span className="font-ui text-desc text-dim">
        retry removes only what is left
      </span>
    ),
  },
};
