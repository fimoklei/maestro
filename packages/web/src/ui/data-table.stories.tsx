import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDataTableColumns, DataTable } from "./data-table";

type Row = { name: string; release: string };

const rows: Row[] = [
  { name: "tdd", release: "v1.4.0" },
  { name: "diagnose", release: "v1.4.0" },
  { name: "caveman", release: "v1.3.2" },
];

const columns = createDataTableColumns<Row>((helper) => [
  helper.accessor("name", {
    header: "Name",
    meta: { className: "font-medium text-gray-12" },
  }),
  helper.accessor("release", {
    header: "Release",
    meta: { className: "w-24 font-mono text-gray-11" },
  }),
]);

const meta = {
  title: "Core/DataTable",
  component: DataTable<Row>,
  args: {
    label: "Example table",
    columns,
    data: rows,
    getRowId: (row: Row) => row.name,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataTable<Row>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSelection: Story = {
  args: {
    selection: {
      label: "Select",
      rowLabel: (row: Row) => `Select ${row.name}`,
      selected: new Set(["diagnose"]),
      onToggle: () => {},
    },
  },
};

export const DetailOpen: Story = { args: { openRowId: "diagnose" } };

// Read-only rows under a row: no cursor, no click; a muted one is not acted on.
export const WithSubRows: Story = {
  args: {
    subRows: (row: Row) =>
      row.name === "tdd"
        ? [
            { id: "tdd:a", cells: { name: "~/.claude/skills" } },
            { id: "tdd:b", cells: { name: "~/.agents/skills" }, muted: true },
          ]
        : [],
  },
};

export const Grouped: Story = {
  args: {
    groups: {
      key: (row: Row) => (row.release === "v1.4.0" ? "Latest" : "Older"),
      order: ["Latest", "Older"],
      collapsed: new Set(),
      onToggle: () => {},
    },
  },
};

// Only one group's rows carry a box; its header picks them, and a blocked row
// keeps an unticked box whose tooltip says why.
export const GroupSelection: Story = {
  args: {
    groups: {
      key: (row: Row) => (row.release === "v1.4.0" ? "Latest" : "Older"),
      order: ["Latest", "Older"],
      collapsed: new Set(),
      onToggle: () => {},
    },
    selection: {
      label: "Select",
      rowLabel: (row: Row) => `Select ${row.name}`,
      selected: new Set(["tdd"]),
      onToggle: () => {},
      onSetSelected: () => {},
      selectable: (row: Row) => row.release === "v1.4.0",
      blocked: (row: Row) =>
        row.name === "diagnose" ? "Another contributor has it open." : null,
      groupLabel: (key: string) =>
        key === "Latest" ? "Select all under Latest" : null,
    },
  },
};

export const Loading: Story = { args: { loading: true, skeletonRows: 6 } };
