import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitHubFactLink } from "./github-fact-link";

const meta = {
  title: "Core/GitHubFactLink",
  component: GitHubFactLink,
  args: {
    value: "github.com/fimoklei/agent-harness",
    page: { kind: "link", url: "https://github.com/fimoklei/agent-harness" },
  },
} satisfies Meta<typeof GitHubFactLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Linked: Story = {};

export const NoPage: Story = { args: { page: undefined } };
