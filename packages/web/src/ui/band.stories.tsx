import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitBranch, RefreshCw, Tag } from "lucide-react";
import type { Band } from "./band";
import { BandRow } from "./band";
import { GitHubMark } from "./github-mark-link";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

const HARNESS: Band = {
  facts: [
    {
      label: "Origin",
      value: "github.com/fimoklei/agent-harness",
      github: {
        kind: "link",
        url: "https://github.com/fimoklei/agent-harness",
      },
      icon: <GitHubMark />,
      machine: true,
      drop: { rank: 2, belowRem: 48 },
    },
    {
      label: "Release",
      value: "v1.4.0",
      icon: <Icon of={Tag} />,
      machine: true,
      drop: { rank: 3, belowRem: 24 },
    },
    {
      label: "Branch",
      value: "main",
      icon: <Icon of={GitBranch} />,
      machine: true,
      drop: { rank: 1, belowRem: 54 },
    },
  ],
  summary: {
    freshness: { readAt: [Date.now() - 4 * 60_000], outcome: "fetched" },
    healthy: "All released",
    counts: [
      { word: "Pending review", count: 0, family: "attention" },
      { word: "Pending release", count: 0, family: "attention" },
    ],
  },
};
const withSummary = (summary: Partial<Band["summary"]>): Band => ({
  ...HARNESS,
  summary: { ...HARNESS.summary, ...summary },
});

function Row({ band, width }: { band: Band; width: number }) {
  return (
    <div
      data-band="2"
      style={{ width }}
      className="flex h-12 items-center gap-inline border border-edge px-panel"
    >
      <BandRow band={band}>
        <IconButton label="Re-read Harness">
          <Icon of={RefreshCw} />
        </IconButton>
      </BandRow>
    </div>
  );
}

const meta = {
  title: "Core/BandRow",
  component: Row,
  args: { band: HARNESS, width: 960 },
} satisfies Meta<typeof Row>;

export default meta;

type Story = StoryObj<typeof meta>;

// Green: nothing to act on, the healthy word.
export const AllFacts: Story = {};

// Amber: counts of work waiting.
export const Attention: Story = {
  args: {
    band: withSummary({
      counts: [
        { word: "Pending review", count: 2, family: "attention" },
        { word: "Pending release", count: 1, family: "attention" },
      ],
    }),
  },
};

// A count chip filtering the table: pressed, with a ×.
export const ActiveChip: Story = {
  args: {
    band: withSummary({
      healthy: "In sync",
      counts: [
        {
          word: "Unknown",
          count: 1,
          family: "failed",
          filter: { pressed: false, onToggle: () => {} },
        },
        {
          word: "Behind",
          count: 3,
          family: "attention",
          filter: { pressed: true, onToggle: () => {} },
        },
      ],
    }),
  },
};

// Red: a failed count, worst first.
export const Failed: Story = {
  args: {
    band: withSummary({
      healthy: "In sync",
      counts: [
        { word: "Unknown", count: 1, family: "failed" },
        { word: "Behind", count: 3, family: "attention" },
      ],
    }),
  },
};

// Grey: no reading yet, so no age.
export const NotReadYet: Story = {
  args: { band: withSummary({ freshness: { readAt: [null], outcome: null } }) },
};

export const OutOfDate: Story = {
  args: {
    band: withSummary({
      freshness: {
        readAt: [Date.now() - 3 * 3_600_000],
        outcome: "fetch-failed",
      },
    }),
  },
};

export const Offline: Story = {
  args: {
    band: withSummary({
      freshness: { readAt: [Date.now() - 3 * 3_600_000], outcome: "offline" },
    }),
  },
};

// Branch and Origin have dropped; Released and the read age stay.
export const Narrow: Story = { args: { width: 480 } };

export const ReadAlone: Story = {
  args: { band: { facts: [], summary: HARNESS.summary } },
};
