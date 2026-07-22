import type { Meta, StoryObj } from "@storybook/react-vite";
import { SegmentedControl } from "./segmented-control";

const meta = {
  title: "Core/SegmentedControl",
  component: SegmentedControl,
  args: {
    label: "Filter by type",
    segments: [
      { value: "all", label: "all" },
      { value: "skill", label: "skills" },
    ],
    value: "all",
    onChange: () => {},
  },
} satisfies Meta<typeof SegmentedControl<string>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SkillsOnly: Story = {};

export const AllTypes: Story = {
  args: {
    segments: [
      { value: "all", label: "all" },
      { value: "skill", label: "skills" },
      { value: "hook", label: "hooks" },
      { value: "mcp", label: "mcp servers" },
      { value: "bundle", label: "bundles" },
    ],
    value: "skill",
  },
};
