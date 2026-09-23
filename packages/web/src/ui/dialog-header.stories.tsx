import type { Meta, StoryObj } from "@storybook/react-vite";
import { DialogHeader } from "./dialog-header";

const meta = {
  title: "Core/DialogHeader",
  component: DialogHeader,
  args: { title: "Register a repository", onClose: () => {} },
} satisfies Meta<typeof DialogHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Busy: Story = { args: { busy: true } };
