import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SearchBox } from "./search-box";

function Row({ compact, width }: { compact: boolean; width: number }) {
  const [value, setValue] = useState("");
  return (
    <div
      style={{ width }}
      className="relative flex h-12 items-center gap-panel border border-edge px-panel"
    >
      <span className="min-w-0 truncate text-gray-11 text-meta">
        Skills 12 · Read 4 min ago
      </span>
      <SearchBox
        className="ml-auto"
        label="Search Skills"
        value={value}
        onChange={setValue}
        compact={compact}
      />
    </div>
  );
}

const meta = {
  title: "Core/SearchBox",
  component: Row,
  args: { compact: false, width: 640 },
} satisfies Meta<typeof Row>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};

// Short of room: the box gives way to 12rem before its neighbours.
export const Narrowed: Story = { args: { width: 360 } };

// The last step on a narrow band: an icon that opens the field over the row.
export const Icon: Story = { args: { compact: true, width: 320 } };
