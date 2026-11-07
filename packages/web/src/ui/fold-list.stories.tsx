import type { Meta, StoryObj } from "@storybook/react-vite";
import { FoldList } from "./fold-list";

const meta = {
  title: "Shell/FoldList",
  component: FoldList,
  decorators: [
    (Story) => (
      <div className="flex w-[608px] flex-col gap-cell">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FoldList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Clean: Story = {
  args: {
    legend: "Written to",
    lines: [
      {
        key: "claude",
        name: "~/.claude/skills",
        tone: "good",
        fact: "2 skills deployed",
        details: [],
        step: null,
      },
      {
        key: "codex",
        name: "~/.agents/skills",
        tone: "neutral",
        muted: true,
        fact: "Codex not detected · not written",
        details: [],
        step: null,
      },
    ],
  },
};

export const Deviating: Story = {
  args: {
    legend: "Written to",
    lines: [
      {
        key: "claude",
        name: "~/.claude/skills",
        tone: "unknown",
        fact: "Not confirmed",
        details: [],
        step: null,
      },
      {
        key: "codex",
        name: "~/.agents/skills",
        tone: "failed",
        fact: "1 of 3 skills missing",
        details: [
          { label: "Missing", value: "commit-message" },
          {
            label: "Not updated",
            value:
              "a-skill-with-a-very-long-name-for-wrapping · still at v1.1.0",
          },
        ],
        step: "Select Retry deploy to deploy them again.",
      },
    ],
  },
};
