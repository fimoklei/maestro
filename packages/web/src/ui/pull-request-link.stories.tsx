import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullRequestLinkList } from "./pull-request-link";

const request = (number: number) => ({
  number,
  url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
});

const meta = {
  title: "Shell/PullRequestLinkList",
  component: PullRequestLinkList,
  args: { requests: [request(47)], focusable: true },
} satisfies Meta<typeof PullRequestLinkList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneRequest: Story = {};

export const SeveralRequests: Story = {
  args: { requests: [request(51), request(52)] },
};
