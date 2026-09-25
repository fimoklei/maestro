import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitHubLinkCell } from "./github-link-cell";

const meta = {
  title: "Core/GitHubLinkCell",
  component: GitHubLinkCell,
  args: {
    name: "maestro",
    page: { kind: "link", url: "https://github.com/fimoklei/maestro" },
    unknownCause:
      "The origin of this repository could not be read. Select Re-read Deploy-state to read it again.",
  },
} satisfies Meta<typeof GitHubLinkCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Linked: Story = {};

export const Unknown: Story = { args: { page: { kind: "unknown" } } };

export const NoPage: Story = { args: { page: undefined } };
