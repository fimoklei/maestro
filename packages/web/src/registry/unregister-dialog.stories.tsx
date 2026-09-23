import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnregisterDialog } from "./unregister-dialog";

const meta = {
  title: "Registry/UnregisterDialog",
  component: UnregisterDialog,
  args: {
    name: "…/Projects/old-site",
    busy: false,
    failure: null,
    onConfirm: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof UnregisterDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Confirm: Story = {};

export const Unregistering: Story = { args: { busy: true } };

export const Failed: Story = {
  args: {
    failure: {
      level: "error",
      label: "Repository not unregistered",
      message: "The list did not change. Select Unregister to try again.",
    },
  },
};
