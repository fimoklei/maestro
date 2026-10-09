import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitHubMarkLink } from "./github-mark-link";

const meta = {
  title: "Core/GitHubMarkLink",
  component: GitHubMarkLink,
  args: {
    name: "maestro",
    page: { kind: "link", url: "https://github.com/fimoklei/maestro" },
  },
} satisfies Meta<typeof GitHubMarkLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Linked: Story = {};

export const NoPage: Story = { args: { page: undefined } };
