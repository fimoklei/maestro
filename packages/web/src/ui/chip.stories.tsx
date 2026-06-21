import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "./chip";

const meta = {
  title: "Core/Chip",
  component: Chip,
  args: { tone: "dim", children: "v1.2.0" },
  argTypes: {
    tone: { control: "inline-radio", options: ["ok", "drift", "dim"] },
  },
} satisfies Meta<typeof Chip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Dim: Story = {};

export const Ok: Story = { args: { tone: "ok", children: "● in sync" } };

export const Drift: Story = { args: { tone: "drift", children: "▲ 2 drift" } };

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <Chip tone="ok">● in sync</Chip>
      <Chip tone="drift">▲ 2 drift</Chip>
      <Chip tone="dim">v1.2.0</Chip>
    </div>
  ),
};
