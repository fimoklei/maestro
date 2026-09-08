import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "../ui/card";
import { InventoryList } from "./inventory-list";
import type { Primitive } from "./use-inventory";

// Dense sortable table with search + type-filter toolbar (mockup 3a).
// Deploy control/pane are app-only (Query hooks) — these show the pure "see" state.
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

// No released skills: the offer that fills the list, not a failure (#841).
export const Empty: Story = {
  args: { primitives: [], onOpenHarness: () => {} },
};
