import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../ui/card";
import { InventoryList } from "./inventory-list";
import type { Primitive } from "./use-inventory";

// The inventory scan surface: the dense, sortable table with its single-row
// search + type-filter toolbar and the trailing expand chevron (mockup 3a). The
// deploy control and pane are injected/opened only in the app (they carry Query
// hooks), so these stories show the pure "see" state: no selection, no staging.
const primitives: Primitive[] = [
  {
    type: "skill",
    name: "code-review",
    description: "Structured review checklist with severity tiers",
  },
  {
    type: "skill",
    name: "react-patterns",
    description: "Component conventions, hooks rules, file layout",
  },
  {
    type: "skill",
    name: "commit-style",
    description: "Conventional commits with scoped prefixes",
  },
  {
    type: "skill",
    name: "api-design",
    description: "REST resource naming and error envelope rules",
  },
  { type: "skill", name: "tdd", description: "Test-driven development." },
];

const meta = {
  title: "Inventory/InventoryList",
  component: InventoryList,
  args: {
    primitives,
    repos: [{ path: "/Users/me/dev/acme-web" }],
    registryReady: true,
    targets: [],
  },
  decorators: [
    (Story) => (
      <div style={{ width: 900 }}>
        <Card>
          <Story />
        </Card>
      </div>
    ),
  ],
} satisfies Meta<typeof InventoryList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { primitives: [] },
};
