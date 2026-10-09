import type { Meta, StoryObj } from "@storybook/react-vite";
import { NoValue } from "./no-value";

const meta = {
  title: "Core/NoValue",
  component: NoValue,
} satisfies Meta<typeof NoValue>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Dash: Story = {};
