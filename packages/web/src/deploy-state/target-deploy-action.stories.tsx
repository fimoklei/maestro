import type { Meta, StoryObj } from "@storybook/react-vite";
import { TargetDeployAction } from "./target-deploy-action";

const meta = {
  title: "Deploy-state/TargetDeployAction",
  component: TargetDeployAction,
  args: { onStartDeploy: () => {} },
} satisfies Meta<typeof TargetDeployAction>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyTarget: Story = {};
