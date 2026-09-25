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
    selected: "/Users/m/Projects/maestro",
    onSelect: () => {},
    loadingTargets: false,
    deployBlocked: false,
    busy: false,
    failure: null,
    report: null,
    onDeploy: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof BulkDeployDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PickTarget: Story = {};

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
              detail: "Local changes in deployed files",
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
              detail: "Deploy failed",
            },
          ],
        },
      ],
    },
  },
};
