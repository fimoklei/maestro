import type { Meta, StoryObj } from "@storybook/react-vite";
import { CATEGORY_FIELD } from "../categories/categories-copy";
import { PastedPromptFields } from "./pasted-prompt-fields";
import { promptFieldErrors } from "./prompt-field-errors";

const idleAdd = {
  run: async () => null,
  pending: false,
  failed: false,
  reset: () => {},
};

const pasted = {
  draft: {
    name: "review-pr",
    frontmatter: "model: opus",
    description: "Review the open pull request.",
    text: "Review $ARGUMENTS.\nUse $1 as the focus.",
    example: "",
  },
  fieldErrors: {},
  part: "text" as const,
  showPart: () => {},
  changed: true,
  leaveName: () => {},
  paste: () => false,
  edit: () => {},
  category: {
    value: null,
    suggested: null,
    hint: CATEGORY_FIELD.hint,
    onChange: () => {},
    add: idleAdd,
  },
  failure: null,
};

// Paste text's fields in Import prompts: Name, then the body fields.
const meta = {
  title: "Harness/PastedPromptFields",
  component: PastedPromptFields,
  args: { pasted, disabled: false },
  decorators: [
    (Story) => (
      <div style={{ width: 448, display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PastedPromptFields>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Filled: Story = {};

/** After a submit with the fields empty. */
export const Empty: Story = {
  args: {
    pasted: {
      ...pasted,
      draft: {
        name: "",
        frontmatter: "",
        description: "",
        text: "",
        example: "",
      },
      fieldErrors: promptFieldErrors([
        "empty-name",
        "empty-description",
        "empty-text",
      ]),
    },
  },
};

/** Locked while the import runs. */
export const Importing: Story = { args: { disabled: true } };
