import type { CopyFacts, CopyPreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { copyFailed, copyPreviewFailed } from "../categories/categories-copy";
import { CopyHarnessCategoriesDialog } from "./copy-harness-categories-dialog";

const facts = (facts: Partial<CopyFacts>): CopyFacts => ({
  added: [],
  deleted: [],
  unchanged: [],
  respelled: [],
  moved: { skills: 0, prompts: 0 },
  uncategorised: { skills: 0, prompts: 0 },
  ...facts,
});

const SIX = [
  "Debugging",
  "Planning",
  "Release",
  "Review",
  "Testing",
  "Writing",
];

const EMPTY_OWN = {
  tag: "v1.5.0",
  count: 6,
  skipped: 0,
  choice: false,
  modes: { add: facts({ added: SIX }), replace: facts({ added: SIX }) },
  fresh: [],
} satisfies CopyPreview;

const WITH_OWN = {
  ...EMPTY_OWN,
  choice: true,
  skipped: 2,
  modes: {
    add: facts({
      added: ["Debugging", "Planning", "Release", "Testing"],
      unchanged: ["Drafts", "Research", "review", "Writing"],
    }),
    replace: facts({
      added: ["Debugging", "Planning", "Release", "Testing"],
      deleted: ["Drafts", "Research"],
      unchanged: ["Review", "Writing"],
      respelled: [{ name: "Review", was: "review" }],
      moved: { skills: 2, prompts: 0 },
      uncategorised: { skills: 1, prompts: 3 },
    }),
  },
} satisfies CopyPreview;

// Replace only adds: no warning, a normal confirm.
const REPLACE_ONLY_ADDS = {
  ...WITH_OWN,
  modes: {
    add: facts({ added: ["Debugging"], unchanged: SIX.slice(1) }),
    replace: facts({ added: ["Debugging"], unchanged: SIX.slice(1) }),
  },
} satisfies CopyPreview;

// Replace moves items without deleting a category.
const REPLACE_MOVES = {
  ...WITH_OWN,
  modes: {
    add: facts({ unchanged: SIX }),
    replace: facts({
      unchanged: SIX,
      moved: { skills: 1, prompts: 0 },
      uncategorised: { skills: 0, prompts: 2 },
    }),
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

export const ReplaceMovesWithoutDeleting: Story = {
  args: { preview: REPLACE_MOVES, mode: "replace" },
};

export const ReplaceOnlyAdds: Story = {
  args: { preview: REPLACE_ONLY_ADDS, mode: "replace" },
};

export const Copying: Story = { args: { busy: true } };

export const CopyFailed: Story = {
  args: { failure: copyFailed("harness-categories-unread") },
};

export const NothingToShow: Story = {
  args: { preview: null, failure: copyPreviewFailed("no-harness-categories") },
};
