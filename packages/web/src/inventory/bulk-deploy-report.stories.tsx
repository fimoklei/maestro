import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkDeployReport } from "./bulk-deploy-report";

const meta = {
  title: "Inventory/BulkDeployReport",
  component: BulkDeployReport,
  args: {
    onForce: () => undefined,
    view: {
      tone: "success",
      targetLabel: "Global",
      deployed: [{ name: "research", version: "v0.3.0" }],
      skipped: ["review"],
      attention: [],
      failed: [],
      counts: { deployed: 2, skipped: 1, attention: 0, failed: 0 },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 560 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BulkDeployReport>;

export default meta;

type Story = StoryObj<typeof meta>;

// The clean run: everything deployed or already up to date. Reads green.
export const AllGreen: Story = {};

// A mixed run: some deployed, one diverged copy needing attention, one hard
// failure. Reads amber; the attention row offers a force reinstall.
export const WithAttentionAndFailure: Story = {
  args: {
    view: {
      tone: "attention",
      targetLabel: "Global",
      deployed: [{ name: "tdd", version: "v1.2.0" }],
      skipped: ["docs"],
      attention: [
        {
          name: "review",
          error: "deployed-diverged-from-lock",
          forceable: true,
        },
      ],
      failed: [{ error: "auth-required", names: ["research", "grill"] }],
      counts: { deployed: 1, skipped: 1, attention: 1, failed: 2 },
    },
  },
};

// Mid-run: the report is on screen while the batch is still executing.
export const Deploying: Story = {
  args: {
    isDeploying: true,
    view: {
      tone: "success",
      targetLabel: "Global",
      deployed: [],
      skipped: [],
      attention: [],
      failed: [],
      counts: { deployed: 0, skipped: 0, attention: 0, failed: 0 },
    },
  },
};
