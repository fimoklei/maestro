import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImportDialog } from "./import-dialog";

const meta = {
  title: "Harness/ImportDialog",
  component: ImportDialog,
  args: {
    source: "/Users/me/work/Code Review",
    name: "code-review",
    load: {
      kind: "ready",
      check: {
        mode: "add",
        name: "code-review",
        sourceBlocker: null,
        nameBlocker: null,
        advisories: [],
      },
    },
    onPickSource: () => {},
    onNameChange: () => {},
    onClose: () => {},
    onImport: () => {},
    onView: () => {},
    importing: false,
    importError: null,
    imported: null,
  },
} satisfies Meta<typeof ImportDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

// Nothing picked yet: the name field waits, and Import is closed.
export const NoFolderPicked: Story = {
  args: { source: null, name: "", load: { kind: "idle" } },
};

// A clash belongs to the name, so it is stated on the name.
export const NameTaken: Story = {
  args: {
    load: {
      kind: "ready",
      check: {
        mode: "add",
        name: "code-review",
        sourceBlocker: null,
        nameBlocker: "name-taken",
        advisories: [],
      },
    },
  },
};

// The folder is not a skill: stated where the folder is, Import closed.
export const SourceRefused: Story = {
  args: {
    load: {
      kind: "ready",
      check: {
        mode: "add",
        name: "code-review",
        sourceBlocker: "missing-manifest",
        nameBlocker: null,
        advisories: [],
      },
    },
  },
};

// Conventions ride along without closing Import.
export const WithAdvisories: Story = {
  args: {
    load: {
      kind: "ready",
      check: {
        mode: "add",
        name: "code-review",
        sourceBlocker: null,
        nameBlocker: null,
        advisories: ["long-manifest", "long-description"],
      },
    },
  },
};

// After the import: what landed, and what the copy left behind.
export const Imported: Story = {
  args: { imported: { mode: "add", name: "code-review", skipped: 12 } },
};

// A refused import: Maestro's own sentence, never a filesystem message.
export const ImportRefused: Story = {
  args: {
    importError: {
      level: "error",
      label: "Over 1,000 files",
      message:
        "Nothing was copied. Pick the skill folder itself, not the repository around it.",
    },
  },
};

// Replacing this Harness's own skill with the copy the author edited where it
// was deployed: one control, the other outcome (#732).
export const Updating: Story = {
  args: {
    source: "/Users/me/work/api-service/.claude/skills/code-review",
    load: {
      kind: "ready",
      check: {
        mode: "update",
        name: "code-review",
        sourceBlocker: null,
        nameBlocker: null,
        advisories: [],
      },
    },
  },
};
