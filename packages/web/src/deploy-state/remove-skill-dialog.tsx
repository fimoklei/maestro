import type { ReclaimPreview } from "@maestro/core";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import type { RemoveWarningState } from "./remove-warning-view";
import { toolDisplayName, toolNameList } from "./tool-labels";

// Which target the removal aims at, in the terms the confirmation must state.
// The global kind carries its detected tools because the scope line is
// mandatory there: the user clicked inside one tool's card, and this modal is
// where the other tools stop being a surprise (#338).
export type RemoveDialogTarget =
  | { kind: "repo"; repoPath: string }
  | { kind: "global"; tools: string[] };

// What the user is told before destroying the deployed copy. Amber, never
// danger red: red is reserved for validation errors, and lost work is a
// consequence of a deliberate action, not a mistake (DESIGN.md). The ▲ pairs
// the colour with a glyph, so the signal survives without colour. "checking"
// speaks up too — silence would read as nothing-to-lose, which is the one thing
// an unfinished check cannot promise (J04).
const WARNING_TEXT: Record<Exclude<RemoveWarningState, "none">, string> = {
  "local-edits":
    "This copy has local edits that never went through central. Removing it loses them for good.",
  "cannot-verify":
    "Nothing was recorded to check this copy against, so local edits can't be checked. Removing it may lose work.",
  "check-failed":
    "Maestro couldn't check this copy for local edits. Removing it may lose work.",
  checking: "Checking this copy for local edits…",
};

// The confirmation in front of taking a deployed skill off a target. A real modal,
// not an inline in-row confirm: removal deletes files, so it deserves the
// interruption — and the modal contract (focus into the panel, Escape, focus
// restore, trapped Tab) comes from the same hook the browse dialog uses. No
// type-to-confirm: this is local and re-doable in one click, so extra ceremony
// would be theatre.
//
// Presentational: it names the action and its target, and reports what the host
// tells it. The host owns the request, the in-flight flag and the error text.
export function RemoveSkillDialog({
  skillName,
  target,
  isRemoving,
  error,
  attempted,
  warning,
  reclaim,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  target: RemoveDialogTarget;
  isRemoving: boolean;
  // What this removal would destroy, as the host's check found it. It informs;
  // it never blocks — destruction is the point of this dialog, so consent is
  // enough (#337).
  warning: RemoveWarningState;
  // The server's own reason for a refused or failed removal, or null while
  // nothing has gone wrong.
  error: string | null;
  // Whether apm actually ran. A guard refusal happens before it does, so the
  // repo is untouched; only an apm run that did not prove itself can have left
  // the repo half-changed. Saying otherwise would send the user hunting for
  // damage that is not there.
  attempted: boolean;
  // A global removal's own reclaim: the whole copy of a tool this machine no
  // longer detects, force-deleted beyond what apm's scoped uninstall touches
  // (#339). Named here by tool and exact path so the confirmation states it
  // before the user agrees — a path the preflight could not build is simply
  // absent, never guessed (#P0).
  reclaim: readonly ReclaimPreview[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Closing is blocked while the removal is in flight, the same rule the browse
  // dialog applies during registration: the outcome is readable nowhere else.
  const { panelRef, requestClose } = useModalDialog({
    onClose: onCancel,
    closeEnabled: !isRemoving,
  });
  const heading = `Remove ${skillName}?`;
  // An answered warning never blocks — but an unfinished one has not warned yet,
  // and apm deletes an edited copy without a word. Holding the confirm until the
  // check answers is the J04 rule applied to consent, not a second guard on top
  // of #337's decision.
  const awaitingCheck = warning === "checking";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-6">
      {/* A real button, hidden from the a11y tree and the tab order, carries the
          backdrop dismiss: clicking outside the panel closes it, mirroring
          Escape, without making a static div interactive. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        className="relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-card border border-line bg-chrome outline-none"
      >
        <div className="border-line-row border-b px-3.5 py-3">
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            {heading}
          </h2>
        </div>

        <div className="flex flex-col gap-2 px-3.5 py-3">
          {/* Both names in full, so two similar rows can be told apart before
              confirming. */}
          <p className="font-mono text-fg-2 text-mono-sm">
            Remove <span className="text-fg">{skillName}</span> from
          </p>
          <p className="break-all font-mono text-dim text-mono-sm">
            {target.kind === "repo" ? target.repoPath : "every detected tool"}
          </p>
          {/* Mandatory on the global path: the trigger sits inside one tool's
              card, so the modal names the whole set before the user agrees to
              it. There is no per-tool remove to offer — apm's uninstall has no
              -t, and narrowing targets: to fake one orphans the other tools'
              files (apm-behavior.md § Remove, ADR-0013). */}
          {target.kind === "global" ? (
            <p className="font-mono text-fg-2 text-tag">
              This takes it off {toolNameList(target.tools)} in one go. There is
              no per-tool remove.
            </p>
          ) : null}
          {/* A global removal also force-deletes the whole copy of any tool
              this machine no longer detects — apm's own uninstall cannot
              reach it (#339). Named by path so the user consents to exactly
              what goes, never a larger set than this dialog stated (#P0). */}
          {reclaim.map((entry) => (
            <p
              key={entry.path}
              className="break-all font-mono text-dim text-tag"
            >
              Also clears the leftover {toolDisplayName(entry.tool)} copy at{" "}
              {entry.path} ({toolDisplayName(entry.tool)} is not installed on
              this machine).
            </p>
          ))}
          <p className="font-mono text-dim text-tag">
            Its deployed files and its lockfile entry go. Deploy it again from
            the inventory whenever you want it back.
          </p>
          {warning === "none" ? null : (
            <p
              role="status"
              className="flex items-start gap-1.5 rounded-control border border-amber-border bg-amber-bg px-2.5 py-2.5 font-mono text-amber-ink text-tag"
            >
              <span aria-hidden="true">▲</span>
              <span>{WARNING_TEXT[warning]}</span>
            </p>
          )}
          {error ? (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-control border border-amber-border bg-amber-bg px-2.5 py-2.5"
            >
              <span className="font-mono text-fg-2 text-mono-sm">{error}</span>
              {attempted ? (
                <span className="font-mono text-amber-ink text-tag">
                  The repo may be in a mixed state — some of this skill's files
                  may already be gone. Check it before trying again.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-line-row border-t px-3.5 py-3">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            disabled={isRemoving}
            onClick={onCancel}
          >
            cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isRemoving || awaitingCheck}
            onClick={onConfirm}
          >
            {isRemoving ? `removing ${skillName}…` : `remove ${skillName}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
