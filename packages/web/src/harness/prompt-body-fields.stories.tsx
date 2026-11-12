import type { Meta, StoryObj } from "@storybook/react-vite";
import { PromptBodyFields } from "./prompt-body-fields";
import { promptFieldErrors } from "./prompt-field-errors";

// Description, Category and the one text box, as Paste text and Edit prompt
// draw them. The Category field is `Harness/CategoryField`.
const meta = {
  title: "Harness/PromptBodyFields",
  component: PromptBodyFields,
  args: {
    draft: {
      description: "Review the open pull request.",
      text: "Review $ARGUMENTS.\nUse $1 as the focus.",
      example: "",
    },
    fieldErrors: {},
    part: "text",
    showPart: () => {},
    edit: () => {},
    paste: null,
    category: null,
    disabled: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 448, display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PromptBodyFields>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PromptText: Story = {};

export const Example: Story = {
  args: {
    part: "example",
    draft: {
      description: "Review the open pull request.",
      text: "Review $ARGUMENTS.",
      example: "/review-pr 42 security",
    },
  },
};

/** After a submit with the fields empty. */
export const Empty: Story = {
  args: {
    draft: { description: "", text: "", example: "" },
    fieldErrors: promptFieldErrors(["empty-description", "empty-text"]),
  },
};

/** Locked while the write runs. */
export const Saving: Story = { args: { disabled: true } };
