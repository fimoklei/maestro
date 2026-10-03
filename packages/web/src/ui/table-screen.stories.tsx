import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderGit2 } from "lucide-react";
import { Button } from "./button";
import { createDataTableColumns } from "./data-table";
import { StatusBadge } from "./status-badge";
import { reading, type StatusReading } from "./status-reading";
import { TableScreen } from "./table-screen";
import { useTableScreen } from "./use-table-screen";
import { useViewOptions } from "./use-view-options";

type Repo = { path: string; status: StatusReading };

const columns = createDataTableColumns<Repo>((helper) => [
  helper.accessor("path", { header: "Folder path" }),
  helper.accessor("status", {
    header: "Status",
    cell: ({ row }) => <StatusBadge reading={row.original.status} />,
    meta: { className: "w-50" },
  }),
]);

const REPOS: Repo[] = [
  { path: "/home/me/acme-web", status: reading("Ready", "good") },
  { path: "/home/me/old-site", status: reading("Folder missing", "failed") },
];

function Screen({
  rows,
  failed,
  withView = false,
}: {
  rows: Repo[];
  failed: boolean;
  withView?: boolean;
}) {
  const state = useTableScreen({
    name: "Repositories",
    reading: false,
    settled: !failed,
    failure: failed
      ? {
          level: "error",
          label: "Registered repositories not read",
          message:
            "Select Re-read Repositories to read the registered repositories again.",
        }
      : null,
    onReread: () => {},
    openOnArrival: null,
  });
  const view = useViewOptions(rows, {
    kind: { label: "Kind", options: [], of: () => "" },
    status: {
      words: ["Folder missing", "Ready"],
      of: (row) => row.status.word,
    },
    groupings: [],
    initialGrouping: "none",
    columns: [{ value: "status", label: "Status" }],
  });
  return (
    <div style={{ height: 480 }}>
      <TableScreen
        state={state}
        action={<Button variant="primary">Register repository</Button>}
        rows={rows}
        columns={columns}
        rowId={(row) => row.path}
        view={withView ? view : undefined}
        freshness={withView ? "Read 4 min ago" : undefined}
        empty={{
          title: "No repositories yet",
          description:
            "The repositories you deploy skills to appear here, with the state of each folder.",
          icon: <FolderGit2 strokeWidth={1.5} className="size-4" />,
          action: <Button>Register repository</Button>,
        }}
      />
    </div>
  );
}

const meta = {
  title: "Core/TableScreen",
  component: Screen,
  args: { rows: REPOS, failed: false },
} satisfies Meta<typeof Screen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Rows: Story = {};

export const Empty: Story = { args: { rows: [] } };

export const FailedRead: Story = { args: { failed: true } };

export const WithViewOptions: Story = { args: { withView: true } };
