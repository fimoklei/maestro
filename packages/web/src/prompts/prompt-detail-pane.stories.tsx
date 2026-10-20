import type { Meta, StoryObj } from "@storybook/react-vite";
import { PromptDetailPane } from "./prompt-detail-pane";

const meta = {
  title: "Prompts/PromptDetailPane",
  component: PromptDetailPane,
  args: {
    prompt: {
      type: "prompt",
      name: "pr-review",
      description:
        "Review a pull request against its issue and our copy rules.",
      path: ".maestro/prompts/pr-review.md",
      text: "Review the pull request at [PR LINK].\n\nRead the diff and the linked issue first.\n\n$ARGUMENTS",
      nameValid: true,
    },
    latestRelease: "v1.4.0",
    copyRefused: false,
    onCopy: () => {},
    onClose: () => {},
    getTriggerElement: () => null,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 640, display: "flex" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PromptDetailPane>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Released: Story = {};

export const NameNotValid: Story = {
  args: {
    prompt: {
      type: "prompt",
      name: "Review_PR",
      description: "",
      path: ".maestro/prompts/Review_PR.md",
      text: "Check the pull request at [PR LINK].",
      nameValid: false,
    },
  },
};

export const CopyRefused: Story = { args: { copyRefused: true } };
