import type { ReclaimPreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RemoveWarningState } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";

// The check answered (or is still answering): the removal is still on offer,
// and any leftover copies it named travel with that answer.
const warns = (
  warning: RemoveWarningState,
  reclaim: readonly ReclaimPreview[] = [],
) => ({ kind: "warning", warning, reclaim }) as const;

// The copy of a tool this machine no longer detects, which a global removal
// force-deletes beyond apm's own scoped uninstall (#339).
const LEFTOVER: readonly ReclaimPreview[] = [
  { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
];

const meta = {
  title: "DeployState/RemoveSkillDialog",
  component: RemoveSkillDialog,
  args: {
    skillName: "tdd",
    version: "v0.5.0",
    target: { kind: "repo", repoPath: "/Users/me/acme-web" },
    isRemoving: false,
    preflight: warns("none"),
    error: null,
    attempted: true,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof RemoveSkillDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

// The question as it is asked: the skill, the exact build going, and the target
// in full, so two similar rows can be told apart before confirming.
export const Confirming: Story = {};

// A row that carries no version. The question drops it rather than invent one.
export const WithoutVersion: Story = { args: { version: null } };

// Mid-removal: both controls are inert and the dialog cannot be dismissed, so
// the outcome cannot be missed.
export const Removing: Story = { args: { isRemoving: true } };

// A removal apm did not confirm. The dialog stays put, carries apm's own reason
// and warns that the repo may be half-changed. Danger red with its own ✕, so a
// failure never reads as one more amber warning.
export const Failed: Story = {
  args: { error: "apm did not confirm the removal. Check apm and try again." },
};

// A confirmed removal refused before apm ran: the deployed copy could not be
// read at all, so nothing was touched and there is no mixed-state note.
export const RemovalRefused: Story = {
  args: {
    attempted: false,
    error:
      "The deployed copy exists but could not be read, so Maestro cannot tell whether removing it would delete local changes.",
  },
};

// The loudest panel this dialog can render: a leftover copy, a local-edits
// warning and a failed removal at once — the state that proves the amber
// warnings and the red failure still read as different objects when stacked.
export const FailedWithWarnings: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: warns("local-edits", LEFTOVER),
    error: "apm did not confirm the removal. Check apm and try again.",
  },
};

// The check has not answered yet, so the confirm control waits with it: an
// unfinished check has not warned about anything, and apm deletes an edited copy
// without a word. Cancel stays open, so waiting is never a trap.
export const Checking: Story = { args: { preflight: warns("checking") } };

// The deployed copy carries edits apm would delete without a word. Amber, not
// danger red — and the confirm control stays usable, because destroying the
// copy is what the user came here to do.
export const WithLocalEdits: Story = {
  args: { preflight: warns("local-edits") },
};

// No baseline to check against. A distinct wording: calling this copy "edited"
// would claim something we never saw.
export const Unverifiable: Story = {
  args: { preflight: warns("cannot-verify") },
};

// The check itself never ran. Its own wording: borrowing the one above would
// blame a missing baseline nothing ever looked for.
export const CheckFailed: Story = {
  args: { preflight: warns("check-failed") },
};

// The check came back with the server refusing the request itself. Not a failed
// check: the removal is already known to be impossible, so the dialog states the
// server's reason in danger red and takes the confirm away — offering it would
// cost the user a round-trip to read the same sentence (#385).
export const CheckRefused: Story = {
  args: {
    preflight: {
      kind: "refused",
      message: "That repo is not registered with Maestro.",
    },
  },
};

// The global scope. The trigger sits inside one tool's card, so the modal names
// every detected tool it will remove from — and says there is no per-tool
// remove to reach for instead.
export const GlobalScope: Story = {
  args: { target: { kind: "global", tools: ["claude", "codex"] } },
};

// A machine where Codex is detected but Claude Code has dropped off — its
// whole copy is a leftover a global removal would force-delete beyond apm's
// own scoped uninstall (#339). Named by path so the user consents to exactly
// what goes, never a larger set than this dialog states.
export const GlobalScopeWithReclaim: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: warns("none", LEFTOVER),
  },
};

// A leftover copy that also carries local edits — the two loudest things this
// dialog can say, stacked, which is the state worth looking at before shipping
// a wording change to either.
export const GlobalScopeWithReclaimAndLocalEdits: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: warns("local-edits", LEFTOVER),
  },
};
