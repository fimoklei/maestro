import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
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

type Story = StoryObj<ComponentProps<typeof GroupedList>>;

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
        legend: "⚠ Undoes newer Harness changes · 1",
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

const rowControl = (name: string) => (
  <button
    type="button"
    aria-label={`Set category for ${name}`}
    className="h-6 rounded-control border border-gray-7 px-tight text-gray-11 text-meta"
  >
    No category
  </button>
);

// Each row ends in its own control; a refused row has none, its reason wraps.
export const ChecklistWithControls: Story = {
  args: {
    live: null,
    groups: [
      {
        tone: "neutral",
        legend: "Can be imported · 1",
        rows: [{ key: "tdd", name: "tdd", control: rowControl("tdd") }],
      },
      {
        tone: "attention",
        legend: "⚠ Already in the Harness · 1",
        rows: [
          {
            key: "review",
            name: "review",
            sentence: "Replaces the one in the Harness",
            control: rowControl("review"),
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
            sentence:
              "The skill folder ~/Projects/acme/.claude/skills/brief holds no SKILL.md. Add one, then select Import skills again.",
            control: rowControl("brief"),
          },
        ],
      },
    ],
    checklist: {
      checked: new Set(["tdd"]),
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
        legend: "⚠ Loses work · 1",
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

export const ReadOnlyWithSlots: Story = {
  args: {
    live: null,
    checklist: null,
    slots: [22, 20],
    groups: [
      {
        tone: "neutral",
        legend: "Added · 2",
        rows: [
          { key: "research", name: "research", slots: ["Skill", "Grace"] },
          { key: "review", name: "review", slots: ["Prompt", "Ada"] },
        ],
      },
      {
        tone: "neutral",
        legend: "Renamed · 1",
        rows: [
          {
            key: "test-first",
            name: "red-green → test-first",
            slots: ["Skill", "Unknown"],
          },
        ],
      },
    ],
  },
};

// Rows named by a path; a row the action leaves alone is muted.
export const ReadOnlyPaths: Story = {
  args: {
    live: null,
    checklist: null,
    groups: [
      {
        tone: "neutral",
        legend: "Writes to",
        rows: [
          { key: "claude", name: "~/.claude/skills", machineName: true },
          {
            key: "agents",
            name: "~/.agents/skills",
            machineName: true,
            muted: true,
            sentence: "Codex not detected · not written",
          },
        ],
      },
    ],
  },
};
