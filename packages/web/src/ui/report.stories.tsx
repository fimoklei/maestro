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
            detail: "Local changes in deployed files",
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
