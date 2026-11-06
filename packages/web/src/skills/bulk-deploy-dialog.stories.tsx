import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkDeployDialog } from "./bulk-deploy-dialog";

const meta = {
  title: "Skills/BulkDeployDialog",
  component: BulkDeployDialog,
  args: {
    count: 6,
    targets: [
      { value: "global", label: "Global" },
      { value: "/Users/m/Projects/maestro", label: "maestro" },
    ],
    selected: null,
    skills: [
      {
        tone: "neutral",
        legend: "Skills · 3",
        rows: [
          { key: "grilling", name: "grilling" },
          { key: "prototype", name: "prototype" },
          { key: "wayfinder", name: "wayfinder" },
        ],
      },
    ],
    writesTo: null,
    onSelect: () => {},
    unavailable: null,
    fieldsChanged: false,
    busy: false,
    failure: null,
    report: null,
    reportFailure: null,
    onDeploy: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof BulkDeployDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PickTarget: Story = {
  args: { unavailable: "Choose a target." },
};

export const TargetChosen: Story = {
  args: {
    selected: "/Users/m/Projects/maestro",
    skills: [
      {
        tone: "neutral",
        legend: "To deploy · 2",
        rows: [
          { key: "grilling", name: "grilling" },
          { key: "prototype", name: "prototype" },
        ],
      },
      {
        tone: "neutral",
        legend: "Already up to date · 1",
        note: "Deploy skips these skills.",
        rows: [{ key: "wayfinder", name: "wayfinder" }],
      },
    ],
  },
};

// A one-tool machine: the undetected tool's folder shows muted.
export const GlobalChosen: Story = {
  args: {
    selected: "global",
    writesTo: {
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
  },
};

export const LoadingTargets: Story = {
  args: { unavailable: "Loading targets…" },
};

export const Deploying: Story = { args: { busy: true } };

export const DidNotRun: Story = {
  args: {
    failure: {
      level: "error",
      label: "Deploy to maestro did not run",
      message:
        "The Maestro server did not answer. Deploy to this target again.",
    },
  },
};

export const PartialReport: Story = {
  args: {
    report: {
      heading:
        "Deployed to maestro · 2 failed · 1 attention · 2 deployed · 1 skipped",
      writtenTo: null,
      notice: null,
      action: null,
      groups: [
        {
          tone: "good",
          label: "Deployed",
          rows: [
            { name: "grilling", detail: "v1.4.0" },
            { name: "prototype", detail: "v1.4.0" },
          ],
        },
        {
          tone: "neutral",
          label: "Already up to date",
          rows: [{ name: "wayfinder" }],
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
          tone: "failed",
          label: "Failed",
          rows: [
            {
              name: "research, code-review",
              count: 2,
              notice: {
                label: "No GitHub access",
                message:
                  "Nothing was deployed. Set up GitHub access in git, then deploy again.",
                detail: "GitHub refused the download.",
              },
            },
          ],
        },
      ],
    },
  },
};

export const GlobalReport: Story = {
  args: {
    count: 2,
    report: {
      heading: "Deployed 2 of 2 skills to Global",
      writtenTo: [
        {
          key: "claude",
          name: "~/.claude/skills",
          tone: "good",
          fact: "2 skills written",
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
      notice: null,
      action: null,
      groups: [
        {
          tone: "good",
          label: "Deployed",
          rows: [
            { name: "code-review", detail: "v2.0.0" },
            { name: "commit-message", detail: "v2.0.0" },
          ],
        },
      ],
    },
  },
};

export const GlobalReportFolderShort: Story = {
  args: {
    count: 2,
    report: {
      heading: "Deployed 1 of 2 skills to Global",
      writtenTo: [
        {
          key: "claude",
          name: "~/.claude/skills",
          tone: "good",
          fact: "2 skills written",
          details: [],
          step: null,
        },
        {
          key: "codex",
          name: "~/.agents/skills",
          tone: "failed",
          fact: "1 of 2 skills missing",
          details: [{ label: "Missing", value: "commit-message" }],
          step: "Select Retry deploy to write it again.",
        },
      ],
      notice: null,
      action: { label: "Retry deploy", onRun: () => {} },
      groups: [
        {
          tone: "good",
          label: "Deployed",
          rows: [{ name: "code-review", detail: "v2.0.0" }],
        },
      ],
    },
  },
};

export const GlobalReportHeldByLocalEdits: Story = {
  args: {
    count: 2,
    report: {
      heading: "Deployed 0 of 2 skills to Global",
      notice: {
        level: "warning",
        label: "Local edits",
        message:
          "Nothing was deployed, because commit-message has local edits.",
        items: [
          "Select Deploy again to replace those edits with the latest release and deploy both skills.",
        ],
        detail:
          "Global skills deploy together, so local edits to commit-message also prevented code-review from being deployed.",
      },
      writtenTo: [
        {
          key: "claude",
          name: "~/.claude/skills",
          tone: "neutral",
          fact: "0 of 2 skills deployed",
          details: [],
          step: null,
        },
        {
          key: "codex",
          name: "~/.agents/skills",
          tone: "neutral",
          fact: "0 of 2 skills deployed",
          details: [],
          step: null,
        },
      ],
      action: { label: "Deploy again", onRun: () => {} },
      groups: [],
    },
  },
};

export const LongList: Story = {
  args: {
    selected: "/Users/m/Projects/maestro",
    skills: [
      {
        tone: "neutral",
        legend: "To deploy · 12",
        rows: Array.from({ length: 12 }, (_, index) => ({
          key: `skill-${index}`,
          name: `a-skill-with-a-long-name-${index + 1}`,
        })),
      },
      {
        tone: "neutral",
        legend: "Already up to date · 1",
        note: "Deploy skips these skills.",
        rows: [{ key: "wayfinder", name: "wayfinder" }],
      },
    ],
  },
};
