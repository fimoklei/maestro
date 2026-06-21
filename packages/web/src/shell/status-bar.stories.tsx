import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusBarView } from "./status-bar";

const meta = {
  title: "Shell/StatusBar",
  component: StatusBarView,
  args: { connection: "connected" },
  argTypes: {
    connection: {
      control: "inline-radio",
      options: ["checking", "connected", "disconnected"],
    },
  },
} satisfies Meta<typeof StatusBarView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Disconnected: Story = { args: { connection: "disconnected" } };

export const Connecting: Story = { args: { connection: "checking" } };
