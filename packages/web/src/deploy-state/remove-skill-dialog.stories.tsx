import type { ReclaimPreview } from "@maestro/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RemoveRowWarning } from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";

// The repo scope answered: one verdict for its one row, and any leftover copies
// it named travel with that answer.
const repoCheck = (
  warning: RemoveRowWarning,
  reclaim: readonly ReclaimPreview[] = [],
) => ({ kind: "offered", check: { kind: "repo", warning }, reclaim }) as const;

// The global scope answered, one verdict per detected tool.
const toolChecks = (
  warnings: Record<string, RemoveRowWarning>,
  reclaim: readonly ReclaimPreview[] = [],
) =>
  ({
    kind: "offered",
    check: { kind: "per-tool", warnings },
    reclaim,
  }) as const;

// The check is still running, so it has claimed nothing about any row.
const CHECKING = {
  kind: "offered",
  check: { kind: "unanswered", warning: "checking" },
  reclaim: [],
} as const;

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
    preflight: repoCheck("none"),
    error: null,
    outcome: null,
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

// Longest name the panel carries — moved from footer (ellipsis, #388) to
// title; proves heading and type tag share the header (#411).
export const LongSkillName: Story = {
  args: { skillName: "some-very-long-skill-name-that-keeps-going" },
};

// A path with no spaces to break at. The ledger row wraps it mid-token rather
// than letting it set the panel's width.
export const LongRepoPath: Story = {
  args: {
    target: {
      kind: "repo",
      repoPath:
        "/Users/me/dev/clients/acme/platform/services/acme-web-frontend",
    },
  },
};

// Mid-removal: both controls are inert and the dialog cannot be dismissed, so
// the outcome cannot be missed.
export const Removing: Story = { args: { isRemoving: true } };

// A removal apm did not confirm. The dialog stays put with apm's own reason,
// and the footer offers the attempt again — `close` and `retry →`, because the
// removal has already been confirmed once. Danger red with its own ✕, so a
// failure never reads as one more amber warning.
export const Failed: Story = {
  args: { error: "apm did not confirm the removal. Check apm and try again." },
};

// A removal that came off one tool and not the other. apm reports one outcome
// for every tool at once, so this ledger is the server's own probe of the disk
// (ADR-0013) — the lead-in counts from it, never from the rows on screen.
export const FailedPerTarget: Story = {
  args: {
    target: { kind: "global", tools: ["claude", "codex"] },
    preflight: toolChecks({ claude: "none", codex: "none" }),
    error: "apm exited 1: permission denied: ~/.codex/skills/tdd/",
    outcome: {
      scope: "global",
      tools: [
        { tool: "claude", state: "removed" },
        { tool: "codex", state: "not-removed" },
      ],
    },
  },
};

// The probe itself could not answer. Reported as unknown, never as removed: a
// check that did not run proves nothing (J04).
export const FailedOutcomeUnknown: Story = {
  args: {
    error: "apm did not confirm the removal. Check apm and try again.",
    outcome: { scope: "repo", state: "unknown" },
  },
};

// A retry the user has already pressed. Same footer, both controls inert: the
// second attempt is as uninterruptible as the first.
export const Retrying: Story = {
  args: {
    isRemoving: true,
    error: "apm did not confirm the removal. Check apm and try again.",
  },
};

// A confirmed removal refused before apm ran: the deployed copy could not be
// read at all. The same footer — retrying a refusal costs a round-trip and
// nothing else.
export const RemovalRefused: Story = {
  args: {
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
    preflight: toolChecks({ codex: "local-edits" }, LEFTOVER),
    error: "apm did not confirm the removal. Check apm and try again.",
  },
};

// The check has not answered yet, so the confirm control waits with it: an
// unfinished check has not warned about anything, and apm deletes an edited copy
// without a word. Cancel stays open, so waiting is never a trap.
export const Checking: Story = { args: { preflight: CHECKING } };

// The deployed copy carries edits apm would delete without a word. Amber, not
// danger red — and the confirm control stays usable, because destroying the
// copy is what the user came here to do.
export const WithLocalEdits: Story = {
  args: { preflight: repoCheck("local-edits") },
};

// No baseline to check against. A distinct wording: calling this copy "edited"
// would claim something we never saw.
export const Unverifiable: Story = {
  args: { preflight: repoCheck("cannot-verify") },
};

// The check itself never ran. Its own wording: borrowing the one above would
// blame a missing baseline nothing ever looked for.
export const CheckFailed: Story = {
  args: { preflight: repoCheck("check-failed") },
};

// Server refused the request itself, not a failed check: removal is already
// known impossible, so no ledger and no confirm control at all (#385, #412).
export const CheckRefused: Story = {
  args: {
    preflight: {
      kind: "refused" as const,
      code: "repo-not-registered" as const,
      message: "That repo is not registered with Maestro.",
    },
  },
};

// Global scope: ledger lists every detected tool the removal reaches.
// No row carries a control — there is no per-tool remove to offer.
export const GlobalScope: Story = {
  args: {
    target: { kind: "global", tools: ["claude", "codex"] },
    preflight: toolChecks({ claude: "none", codex: "none" }),
  },
};

// A leftover copy a global removal force-deletes beyond apm's own scoped
// uninstall (#339) — its own ledger row, named by path.
export const GlobalScopeWithReclaim: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: toolChecks({ codex: "none" }, LEFTOVER),
  },
};

// A leftover copy that also carries local edits — the two loudest things this
// dialog can say, stacked, which is the state worth looking at before shipping
// a wording change to either.
export const GlobalScopeWithReclaimAndLocalEdits: Story = {
  args: {
    target: { kind: "global", tools: ["codex"] },
    preflight: toolChecks({ codex: "local-edits" }, LEFTOVER),
  },
};
