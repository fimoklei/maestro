import type { CopyPreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { copyFailed, copyPreviewFailed } from "../categories/categories-copy";
import { CopyHarnessCategoriesDialog } from "./copy-harness-categories-dialog";

const EMPTY_OWN = {
  tag: "v1.5.0",
  count: 6,
  skipped: 0,
  choice: false,
  modes: {
    add: {
      added: [
        "Debugging",
        "Planning",
        "Release",
        "Review",
        "Testing",
        "Writing",
      ],
      deleted: [],
      unchanged: [],
    },
    replace: {
      added: [
        "Debugging",
        "Planning",
        "Release",
        "Review",
        "Testing",
        "Writing",
      ],
      deleted: [],
      unchanged: [],
    },
  },
  fresh: [],
} satisfies CopyPreview;

const WITH_OWN = {
  ...EMPTY_OWN,
  choice: true,
  skipped: 2,
  modes: {
    add: {
      added: ["Debugging", "Planning", "Release", "Testing"],
      deleted: [],
      unchanged: ["Drafts", "Research", "Review", "Writing"],
    },
    replace: {
      added: ["Debugging", "Planning", "Release", "Testing"],
      deleted: ["Drafts", "Research"],
      unchanged: ["Review", "Writing"],
    },
  },
} satisfies CopyPreview;

const meta = {
  title: "Settings/CopyHarnessCategoriesDialog",
  component: CopyHarnessCategoriesDialog,
  args: {
    preview: EMPTY_OWN,
    mode: "add",
    onModeChange: () => {},
    failure: null,
    busy: false,
    onCopy: () => {},
    onClose: () => {},
  },
} satisfies Meta<typeof CopyHarnessCategoriesDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = { args: { preview: null } };

export const EmptyList: Story = {};

export const WithOwnCategories: Story = { args: { preview: WITH_OWN } };

// Two categories arrived since the operator last looked.
export const NewSinceLastLook: Story = {
  args: { preview: { ...WITH_OWN, fresh: ["Release", "Testing"] } },
};

export const ReplaceSelected: Story = {
  args: { preview: WITH_OWN, mode: "replace" },
};

export const Copying: Story = { args: { busy: true } };

export const CopyFailed: Story = {
  args: { failure: copyFailed("harness-categories-unread") },
};

export const NothingToShow: Story = {
  args: { preview: null, failure: copyPreviewFailed("no-harness-categories") },
};
