import type { Meta, StoryObj } from "@storybook/react-vite";
import { driftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "./deployed-rollup";
import { INVENTORY_NOT_READ } from "./inventory-copy";
import { InventoryView } from "./inventory-view";
import type { Primitive } from "./use-inventory";

// The Inventory screen with its reads handed in. The detail pane and the bulk
// strip use Query hooks, so these stories show the table only.
const primitives: Primitive[] = [
  {
    type: "skill",
    name: "audit-dependencies",
    description: "Scan every local repo for vulnerable packages",
  },
  {
    type: "skill",
    name: "brutal-critic",
    description: "Review work without softening the findings",
  },
  {
    type: "skill",
    name: "create-issue",
    description: "Open a tracker issue from a rough note",
  },
  {
    type: "skill",
    name: "diagnose",
    description: "Loop for hard bugs and slow paths",
  },
  {
    type: "skill",
    name: "karpathy-guidelines",
    description: "Small, legible, testable code",
  },
  {
    type: "skill",
    name: "tdd",
    description: "Red, green, refactor, with a real check",
  },
];

const target = (
  names: string[],
  behind: string[] = [],
  unknown = false,
): DeploymentTarget => ({
  label: "Global",
  target: { kind: "global" },
  deployed: { status: "ready", names, skippedCount: 0, attentionCount: 0 },
  primitives: names.map((name) => ({ type: "skill", name, version: "v1.4.0" })),
  drift: driftViewModel(
    unknown
      ? { data: undefined, isError: true }
      : {
          data: {
            behind: behind.map((name) => ({
              name,
              current: "v1.3.0",
              latest: "v1.4.0",
              reading: "behind" as const,
            })),
          },
          isError: false,
        },
  ),
});

const meta = {
  title: "Inventory/InventoryView",
  component: InventoryView,
  args: {
    primitives,
    repos: [{ path: "/Users/me/dev/acme-web" }],
    registryReady: true,
    targets: [
      target(
        ["audit-dependencies", "create-issue", "diagnose", "tdd"],
        ["create-issue"],
      ),
      target(["tdd", "diagnose"]),
      target(["karpathy-guidelines"], [], true),
    ],
    notice: null,
    loading: false,
    reading: false,
    onReread: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ height: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InventoryView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// A read past 1.3 s, or a pressed Re-read: skeleton rows in the table's shape.
export const Reading: Story = {
  args: { primitives: undefined, loading: true, reading: true },
};

// A failed re-read keeps the previous rows under its notice (ADR-0033 §11).
export const ReadFailed: Story = {
  args: {
    notice: {
      ...INVENTORY_NOT_READ,
      action: { label: "Re-read Inventory", onClick: () => {} },
    },
  },
};

// No released skills: the offer that fills the list, not a failure (#841).
export const Empty: Story = {
  args: { primitives: [], targets: [], onOpenHarness: () => {} },
};
