import type { Meta, StoryObj } from "@storybook/react-vite";
import { GroupedList } from "./grouped-list";

const meta = {
  title: "Shell/GroupedList",
  component: GroupedList,
  decorators: [
    (Story) => (
      <div className="flex w-[608px] flex-col gap-cell">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupedList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Checklist: Story = {
  args: {
    live: null,
    groups: [
      {
        tone: "neutral",
        legend: "Can be imported · 2",
        rows: [
          { key: "tdd", name: "tdd" },
          { key: "jobs", name: "jobs" },
        ],
      },
      {
        tone: "attention",
        legend: "▲ Undoes newer Harness changes · 1",
        rows: [
          {
            key: "grill",
            name: "grill",
            sentence:
              "Deployed from release v0.3.1. Importing undoes newer Harness changes to this skill.",
          },
        ],
      },
      {
        tone: "failed",
        legend: "✕ Cannot be imported · 1",
        rows: [
          {
            key: "brief",
            name: "brief",
            sentence: "The Claude Code and Codex copies differ.",
          },
        ],
      },
    ],
    checklist: {
      checked: new Set(["tdd", "jobs"]),
      onToggle: () => {},
      isRunning: false,
      firstBox: null,
    },
  },
};

// A preflight: what the removal costs and what it refuses.
export const ReadOnly: Story = {
  args: {
    live: null,
    groups: [
      {
        tone: "attention",
        legend: "▲ Loses work · 1",
        rows: [
          {
            key: "acme-api",
            name: "acme-api",
            value: "v1.0.0",
            sentence: "Nothing recorded — may lose work",
          },
        ],
      },
      {
        tone: "failed",
        legend: "✕ Cannot be removed · 1",
        rows: [
          {
            key: "legacy-etl",
            name: "legacy-etl",
            sentence: "Repository not registered",
          },
        ],
      },
    ],
    checklist: null,
  },
};
