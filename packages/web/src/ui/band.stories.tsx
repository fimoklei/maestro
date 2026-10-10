import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw } from "lucide-react";
import type { Band } from "./band";
import { BandRow } from "./band";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";

const HARNESS: Band = {
  facts: [
    {
      label: "Origin",
      value: "github.com/fimoklei/agent-harness",
      github: {
        kind: "link",
        url: "https://github.com/fimoklei/agent-harness",
      },
      machine: true,
      drop: { rank: 2, belowRem: 48 },
    },
    {
      label: "Released",
      value: "v1.4.0",
      machine: true,
      drop: { rank: 3, belowRem: 24 },
    },
    {
      label: "Branch",
      value: "main",
      machine: true,
      drop: { rank: 1, belowRem: 54 },
    },
  ],
  read: { sentence: "Read 4 min ago", attention: false },
};

function Row({ band, width }: { band: Band; width: number }) {
  return (
    <div
      data-band="2"
      style={{ width }}
      className="flex h-12 items-center gap-inline border border-edge px-panel"
    >
      <BandRow band={band}>
        <IconButton label="Re-read Harness">
          <Icon of={RefreshCw} />
        </IconButton>
      </BandRow>
    </div>
  );
}

const meta = {
  title: "Core/BandRow",
  component: Row,
  args: { band: HARNESS, width: 960 },
} satisfies Meta<typeof Row>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllFacts: Story = {};

export const OutOfDate: Story = {
  args: {
    band: {
      ...HARNESS,
      read: { sentence: "Read failed — last read 3 h ago", attention: true },
    },
  },
};

// Branch and Origin have dropped; Released and Read stay.
export const Narrow: Story = { args: { width: 480 } };

export const ReadAlone: Story = {
  args: { band: { facts: [], read: HARNESS.read } },
};
