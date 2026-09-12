import type { Meta, StoryObj } from "@storybook/react-vite";
import { UnfinishedOperationHead } from "./unfinished-operation-head";

const meta = {
  title: "DeployState/UnfinishedOperationHead",
  component: UnfinishedOperationHead,
  args: {
    pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd", "review"] },
    onRetry: () => {},
  },
} satisfies Meta<typeof UnfinishedOperationHead>;
export default meta;

type Story = StoryObj<typeof meta>;

export const DeployIncomplete: Story = {};

export const RemovalIncomplete: Story = {
  args: { pending: { kind: "remove", release: "v0.3.4", desired: ["tdd"] } },
};

export const Retrying: Story = { args: { isRetrying: true } };
