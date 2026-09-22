import type { Meta, StoryObj } from "@storybook/react-vite";
import { ListFilter } from "lucide-react";
import { OptionMenu } from "./option-menu";

const meta = {
  title: "Core/OptionMenu",
  component: OptionMenu,
  args: {
    label: "Filter",
    icon: <ListFilter aria-hidden="true" size={16} strokeWidth={1.5} />,
    sections: [
      {
        kind: "radio",
        label: "Type",
        options: [
          { value: "all", label: "All" },
          { value: "skill", label: "Skills" },
        ],
        value: "all",
        onChange: () => {},
      },
      {
        kind: "check",
        label: "Status",
        options: [
          { value: "Behind", label: "Behind" },
          { value: "Unknown", label: "Unknown" },
        ],
        values: new Set(["Behind"]),
        onToggle: () => {},
      },
    ],
  },
} satisfies Meta<typeof OptionMenu>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A set filter is never invisible: the count sits on the control.
export const WithActiveFilters: Story = { args: { count: 1 } };

export const Unavailable: Story = { args: { unavailable: "no skills yet" } };
