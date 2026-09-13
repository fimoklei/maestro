import type { Meta, StoryObj } from "@storybook/react-vite";
import { UpdatingLine } from "./updating-line";

const meta = {
  title: "DeployState/UpdatingLine",
  component: UpdatingLine,
  args: { release: "v0.3.4" },
} satisfies Meta<typeof UpdatingLine>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Updating: Story = {};
