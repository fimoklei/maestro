import type { Meta, StoryObj } from "@storybook/react-vite";
import { PathField } from "./path-field";
import { chooserNotice } from "./path-field-copy";
import type { FolderChooser } from "./use-folder-chooser";

const chooser: FolderChooser = {
  available: true,
  busy: false,
  notice: null,
  browse: () => {},
};

const meta = {
  title: "Shell/PathField",
  component: PathField,
  args: {
    label: "Folder path",
    hint: "Import copies this folder to the Working Harness. The original folder stays unchanged.",
    value: "/Users/me/.claude/skills/grilling",
    onChange: () => {},
    chooser,
  },
  decorators: [
    (Story) => (
      <div className="max-w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PathField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The system chooser is open: Browse spins and is locked, the field stays
// typeable.
export const ChooserOpen: Story = {
  args: { chooser: { ...chooser, busy: true } },
};

// No chooser on this computer (Linux, or a missing helper): no Browse.
export const NoChooser: Story = {
  args: { chooser: { ...chooser, available: false } },
};

export const ChooserFailed: Story = {
  args: {
    chooser: {
      ...chooser,
      notice: chooserNotice(new TypeError("fetch failed")),
    },
  },
};
