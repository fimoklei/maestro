import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkDeployDialog } from "./bulk-deploy-dialog";

const meta = {
  title: "Inventory/BulkDeployDialog",
  component: BulkDeployDialog,
  args: {
    count: 6,
    targets: [
      { value: "global", label: "Global (Claude Code, Codex)" },
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
  args: { unavailable: "no target" },
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

export const LoadingTargets: Story = {
  args: { unavailable: "targets still loading" },
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
                  "Deploy again to replace the local edits with the latest release.",
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
