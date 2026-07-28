import type { Meta, StoryObj } from "@storybook/react-vite";
import { RemoveSkillDialog } from "./remove-skill-dialog";

const meta = {
  title: "DeployState/RemoveSkillDialog",
  component: RemoveSkillDialog,
  args: {
    skillName: "tdd",
    target: { kind: "repo", repoPath: "/Users/me/acme-web" },
    isRemoving: false,
    warning: "none",
    error: null,
    attempted: true,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof RemoveSkillDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

// The question as it is asked: both names in full, so two similar rows can be
// told apart before confirming.
export const Confirming: Story = {};

// Mid-removal: both controls are inert and the dialog cannot be dismissed, so
// the outcome cannot be missed.
export const Removing: Story = { args: { isRemoving: true } };

// A removal apm did not confirm. The dialog stays put, carries apm's own reason
// and warns that the repo may be half-changed.
export const Failed: Story = {
  args: { error: "apm did not confirm the removal. Check apm and try again." },
};

// Refused before apm ran: the deployed copy could not be read at all, so
// nothing was touched and there is no mixed-state note.
export const Refused: Story = {
  args: {
    attempted: false,
    error:
      "The deployed copy exists but could not be read, so Maestro cannot tell whether removing it would delete local changes.",
  },
};

// The check has not answered yet, so the confirm control waits with it: an
// unfinished check has not warned about anything, and apm deletes an edited copy
// without a word. Cancel stays open, so waiting is never a trap.
export const Checking: Story = { args: { warning: "checking" } };

// The deployed copy carries edits apm would delete without a word. Amber, not
// danger red — and the confirm control stays usable, because destroying the
// copy is what the user came here to do.
export const WithLocalEdits: Story = { args: { warning: "local-edits" } };

// No baseline to check against. A distinct wording: calling this copy "edited"
// would claim something we never saw.
export const Unverifiable: Story = { args: { warning: "cannot-verify" } };

// The check itself never ran. Its own wording: borrowing the one above would
// blame a missing baseline nothing ever looked for.
export const CheckFailed: Story = { args: { warning: "check-failed" } };

// The global scope. The trigger sits inside one tool's card, so the modal names
// every detected tool it will remove from — and says there is no per-tool
// remove to reach for instead.
export const GlobalScope: Story = {
  args: { target: { kind: "global", tools: ["claude", "codex"] } },
};
