import type { InventorySkill } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { driftViewModel } from "../drift/drift-view-model";
import type { DeploymentTarget } from "../inventory/deployed-rollup";
import { INVENTORY_NOT_READ } from "../inventory/inventory-copy";
import { SkillsView } from "./skills-view";

// The Skills screen with its reads handed in. The detail pane and the bulk
// strip use Query hooks, so these stories show the table only.
const primitives: InventorySkill[] = [
  {
    type: "skill",
    name: "audit-dependencies",
    path: ".apm/skills/audit-dependencies",
    pendingRelease: null,
    description: "Scan every local repo for vulnerable packages",
  },
  {
    type: "skill",
    name: "brutal-critic",
    path: ".apm/skills/brutal-critic",
    pendingRelease: null,
    description: "Review work without softening the findings",
  },
  {
    type: "skill",
    name: "create-issue",
    path: ".apm/skills/create-issue",
    pendingRelease: null,
    description: "Open a tracker issue from a rough note",
  },
  {
    type: "skill",
    name: "diagnose",
    path: ".apm/skills/diagnose",
    pendingRelease: null,
    description: "Loop for hard bugs and slow paths",
  },
  {
    type: "skill",
    name: "karpathy-guidelines",
    path: ".apm/skills/karpathy-guidelines",
    pendingRelease: null,
    description: "Small, legible, testable code",
  },
  {
    type: "skill",
    name: "tdd",
    path: ".apm/skills/tdd",
    pendingRelease: null,
    description: "Red, green, refactor, with a real check",
  },
];

const target = (
  names: string[],
  behind: string[] = [],
  unknown = false,
): DeploymentTarget => ({
  pending: undefined,
  label: "Global",
  target: { kind: "global" },
  deployed: {
    status: "ready",
    names,
    skippedCount: 0,
    attentionCount: 0,
    followsRelease: false,
  },
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
  title: "Skills/SkillsView",
  component: SkillsView,
  args: {
    primitives,
    repos: [{ path: "/Users/me/dev/acme-web" }],
    registryReady: true,
    harness: {
      origin: "github.com/acme/harness",
      github: { kind: "link", url: "https://github.com/acme/harness" },
      latestRelease: "v1.4.0",
    },
    reads: [{ at: Date.now() - 4 * 60_000, failed: false }],
    targets: [
      target(
        ["audit-dependencies", "create-issue", "diagnose", "tdd"],
        ["create-issue"],
      ),
      target(["tdd", "diagnose"]),
      target(["karpathy-guidelines"], [], true),
    ],
    failure: null,
    reading: false,
    onReread: () => {},
    clone: {
      kind: "read",
      checks: Object.fromEntries(
        primitives.map((primitive) => [
          primitive.name,
          {
            inClone: true,
            path: `.apm/skills/${primitive.name}`,
            pendingRelease: null,
            workingTree: "tree",
            uncommitted: false,
            localOnly: false,
          },
        ]),
      ),
    },
    onDeleted: () => {},
    assignments: undefined,
    categoryNames: undefined,
    initialCategory: null,
  },
  decorators: [
    (Story) => (
      <div style={{ height: 600 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SkillsView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Reading: Story = {
  args: { primitives: undefined, reading: true },
};

export const ReadFailed: Story = {
  args: {
    failure: INVENTORY_NOT_READ,
  },
};

export const Empty: Story = {
  args: { primitives: [], targets: [], onOpenHarness: () => {} },
};
