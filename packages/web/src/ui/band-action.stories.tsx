import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderInput } from "lucide-react";
import { BandAction } from "./band-action";

// Narrow the canvas below 1024px to see it fold to its icon.
const meta = {
  title: "Core/BandAction",
  component: BandAction,
  args: { icon: FolderInput, label: "Import skill", onClick: () => {} },
} satisfies Meta<typeof BandAction>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
