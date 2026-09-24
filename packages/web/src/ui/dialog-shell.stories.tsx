import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { DIALOG_CANCEL, DialogShell } from "./dialog-shell";
import { panelBorderFor } from "./panel-border";

// One body for every state, so a story shows the frame rather than a dialog.
function Body({ lines = 1 }: { lines?: number }) {
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-gray-7 border-b px-3.5 py-3">
        <h2 className="font-semibold font-ui text-gray-12 text-prose">
          Remove <span className="font-mono">tdd</span>
        </h2>
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {Array.from({ length: lines }, (_, index) => (
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: filler text, no identity
            key={index}
            className="m-0 font-ui text-meta text-gray-12"
          >
            Removing this copy deletes the files it deployed.
          </p>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 border-gray-7 border-t px-3.5 py-3">
        <span className="flex-1" />
        <Button type="button" variant="quiet" size="sm" {...DIALOG_CANCEL}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm">
          Remove skill
        </Button>
      </div>
    </>
  );
}

const meta = {
  title: "Shell/DialogShell",
  component: DialogShell,
  args: {
    label: "Remove tdd",
    describedBy: null,
    width: 480,
    onClose: () => {},
    children: <Body />,
  },
} satisfies Meta<typeof DialogShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The second of the two widths, for a Report or a folder listing.
export const Wide: Story = {
  args: { width: 640, height: "compact" },
};

// Focus opens on Cancel, so Enter never confirms the deletion.
export const Destructive: Story = {
  args: { destructive: true },
};

// The outline states the panel's worst news before a word is read.
export const CostOutline: Story = {
  args: { border: panelBorderFor({ failure: false, cost: true }) },
};

export const FailureOutline: Story = {
  args: { border: panelBorderFor({ failure: true, cost: false }) },
};

// A body taller than the screen scrolls; the footer stays reachable.
export const LongBody: Story = {
  args: { children: <Body lines={40} /> },
};

// Closing is held while a request is in flight — Escape and the backdrop
// do nothing until it answers.
export const Busy: Story = {
  args: { closeEnabled: false },
};
