import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { HttpError } from "../api/http";
import { promptReadNotice } from "../harness/import-prompt-copy";
import { COPY_PROMPT, DELETE_PROMPT } from "../ui/control-labels";
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
      pendingRelease: null,
      text: "Review the pull request at [PR LINK].\n\nRead the diff and the linked issue first.\n\n$ARGUMENTS",
      nameValid: true,
    },
    latestRelease: "v1.4.0",
    copyRefused: false,
    readRefusal: null,
    onCopy: () => {},
    footItems: [
      { label: COPY_PROMPT, onSelect: () => {} },
      { label: DELETE_PROMPT, danger: true, onSelect: () => {} },
    ],
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
      pendingRelease: null,
      text: "Check the pull request at [PR LINK].",
      nameValid: false,
    },
  },
};

export const CopyRefused: Story = { args: { copyRefused: true } };

export const NotInClone: Story = {
  args: {
    readRefusal: promptReadNotice(
      new HttpError(404, "refused", "prompt-missing"),
      {
        name: "pr-review",
        origin: "github.com/fimoklei/agent-harness",
        localDeletion: true,
      },
    ),
  },
};

// The next-step sentence links the Harness screen, so it needs a router.
export const PendingRename: Story = {
  args: {
    prompt: {
      ...meta.args.prompt,
      pendingRelease: {
        change: "rename",
        renamedTo: "pr-check",
        defaultBranch: "main",
      },
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
