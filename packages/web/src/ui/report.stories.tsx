import type { Meta, StoryObj } from "@storybook/react-vite";
import { Report } from "./report";

const meta = {
  title: "Shell/Report",
  component: Report,
  decorators: [
    (Story) => (
      <div className="w-[608px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Report>;

export default meta;

type Story = StoryObj<typeof meta>;

// Worst first: Failed, Attention, Already up to date, Deployed.
export const Partial: Story = {
  args: {
    heading:
      "Deployed to maestro · 1 failed · 1 attention · 3 deployed · 1 skipped",
    groups: [
      {
        tone: "failed",
        label: "Failed",
        rows: [
          {
            name: "research",
            detail:
              "The Maestro server did not answer. Deploy to this target again.",
          },
        ],
      },
      {
        tone: "attention",
        label: "Attention",
        rows: [
          {
            name: "tdd",
            notice: {
              label: "Local changes in deployed files",
              message:
                "Deploy this skill again to replace the local edits with the latest release.",
              detail: "The edits never went through the Harness.",
            },
            action: { label: "Deploy tdd again", onClick: () => {} },
          },
        ],
      },
      {
        tone: "neutral",
        label: "Already up to date",
        rows: [{ name: "wayfinder" }],
      },
      {
        tone: "good",
        label: "Deployed",
        rows: [
          { name: "grilling", detail: "v1.4.0" },
          { name: "domain-modeling", detail: "v1.4.0" },
          { name: "prototype", detail: "v1.4.0" },
        ],
      },
    ],
  },
};

const pullRequest = (number: number) => ({
  number,
  url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
});

const proposed = (name: string, change: string, number: number) => ({
  name,
  change,
  pullRequest: pullRequest(number),
});

// A batch proposal: each row states its Change word, and a proposed row ends
// in its pull request.
export const Proposed: Story = {
  args: {
    heading: "Proposed 7 of 9 changes",
    groups: [
      {
        tone: "failed",
        label: "Not proposed",
        rows: [
          {
            name: "old-deploy",
            change: "Deleted",
            detail:
              "The push to GitHub failed. Select Propose change again to retry.",
          },
        ],
      },
      {
        tone: "attention",
        label: "Pull request missing",
        rows: [
          {
            name: "pr-body",
            change: "Added",
            detail:
              "The proposal branch is on GitHub without a pull request. Close this dialog, then select Create pull request.",
          },
        ],
      },
      {
        tone: "good",
        label: "Proposed",
        note: "Review and merge each pull request on GitHub. Then select Create a release.",
        rows: [
          proposed("code-review", "Added", 214),
          proposed("commit-message", "Added", 215),
          proposed("tdd", "Added", 216),
          proposed("write-spec", "Added", 217),
          proposed("release-notes", "Added", 218),
          proposed("standup-notes", "Added", 219),
          proposed("legacy-review", "Deleted", 220),
        ],
      },
    ],
  },
};

// Nothing needed the reader: only the group that happened is drawn.
export const Clean: Story = {
  args: {
    heading: "Deployed to maestro · 3 deployed",
    groups: [
      {
        tone: "good",
        label: "Deployed",
        rows: [
          { name: "grilling", detail: "v1.4.0" },
          { name: "domain-modeling", detail: "v1.4.0" },
          { name: "prototype", detail: "v1.4.0" },
        ],
      },
    ],
  },
};
