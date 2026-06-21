import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "./logo";

const meta = {
  title: "Shell/Logo",
  component: Logo,
  args: { size: 26, wordmark: false },
} satisfies Meta<typeof Logo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TileOnly: Story = {};

export const WithWordmark: Story = { args: { wordmark: true } };

export const WithContext: Story = {
  args: { wordmark: true, context: "agent-harness · main · 9 primitives" },
};

export const Large: Story = { args: { size: 48, wordmark: true } };
