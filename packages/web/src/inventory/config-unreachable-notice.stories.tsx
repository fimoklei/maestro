import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfigUnreachableNotice } from "./config-unreachable-notice";

const meta = {
  title: "Shell/ConfigUnreachableNotice",
  component: ConfigUnreachableNotice,
  args: { onRetry: () => {} },
} satisfies Meta<typeof ConfigUnreachableNotice>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
