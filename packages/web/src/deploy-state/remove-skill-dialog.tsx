import type { ReactNode } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import type {
  RemovePreflightView,
  RemoveWarningState,
} from "./remove-preflight-view";
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
    "This copy has local edits. Copy them out first — removing it deletes them with the copy.",
  "cannot-verify":
    "Nothing was recorded to check this copy against, so local edits can't be checked. Removing it may lose work.",
  "check-failed":
    "Maestro couldn't check this copy for local edits. Removing it may lose work.",
  checking: "Checking this copy for local edits…",
};

// The one amber container in this panel. Both blocks that wear it say the same
// kind of thing — this removal will cost something — so they are meant to look
// identical, and one owner is what keeps them that way.
const WARNING_SURFACE =
  "rounded-control border border-amber-border bg-amber-bg px-2.5 py-2.5";

// A removal that either cannot happen or did not happen. Danger red rather than
// the amber above: amber names a cost the removal will pay, this names a
// removal that went wrong — the error signal red exists for (issue #213). The
// leading ✕ and the label carry the meaning where colour cannot
// (Never-Colour-Alone). Announced assertively: it arrives on its own and takes
// the confirm control with it.
//
// One component for both failures, because they render one object: rendering
// them separately is how the panel ended up with a glyphed refusal and a
// glyph-less error that looked like an ordinary warning (#387).
function FailureNote({
  label,
  message,
  children,
}: {
  label: string;
  message: string;
  // Anything the failure adds beyond the server's own sentence.
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-control border border-danger-border bg-danger-bg px-2.5 py-2.5"
    >
      <span className="font-semibold font-ui text-danger-ink text-tag">
        <span aria-hidden="true">✕ </span>
        {label}
      </span>
      <span className="font-ui text-body text-fg-2">{message}</span>
      {children}
    </div>
  );
}

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
  version,
  target,
  isRemoving,
  error,
  attempted,
  preflight,
  onCancel,
  onConfirm,
}: {
  skillName: string;
  // The build about to be destroyed, as the row states it, or null when the
  // screen never had one. Required rather than optional: a caller that cannot
  // name the version says so, instead of dropping it by omission and leaving
  // the user to carry it across a menu and a modal.
  version: string | null;
  target: RemoveDialogTarget;
  isRemoving: boolean;
  // What the host's check came back with. A warning informs and never blocks —
  // destruction is the point of this dialog, so consent is enough (#337). A
  // refusal is the opposite: the server already said the removal cannot
  // succeed, so there is nothing to consent to (#385). One prop rather than
  // two, so the screen can never state a cost and a refusal at the same time.
  preflight: RemovePreflightView;
  // The server's own reason for a removal that was refused or failed after the
  // user confirmed it, or null while nothing has gone wrong. Not the same thing
  // as a refused `preflight`, which happens before there is anything to confirm.
  error: string | null;
  // Whether apm can have run. Only a failure that provably refused before it
  // did leaves the repo untouched; anything else may have left it half-changed,
  // and the mixed-state note follows this flag. `removal-attempt.ts` owns the
  // classification — the dialog only renders it.
  attempted: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Closing is blocked while the removal is in flight, the same rule the browse
  // dialog applies during registration: the outcome is readable nowhere else.
  const { panelRef, requestClose } = useModalDialog({
    onClose: onCancel,
    closeEnabled: !isRemoving,
  });
  const named = version === null ? skillName : `${skillName} ${version}`;
  const heading = `Remove ${named}?`;
  // An answered warning never blocks — but an unfinished one has not warned yet,
  // and apm deletes an edited copy without a word. Holding the confirm until the
  // check answers is the J04 rule applied to consent, not a second guard on top
  // of #337's decision.
  const awaitingCheck =
    preflight.kind === "warning" && preflight.warning === "checking";
  // A removal the server has already refused. Every line below that describes
  // what the removal would do is silenced with it: none of it will happen.
  const refused = preflight.kind === "refused";
  // Only ever the leftovers the check in hand named. A refusal carries none, so
  // an earlier answer's paths cannot outlive the answer that named them.
  const reclaim = preflight.kind === "warning" ? preflight.reclaim : [];

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
          {/* "Remove" and "?" are chrome; the name and version are data, so
              they take the mono face inside the sans question (Mono-Is-Data). */}
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Remove <span className="font-mono">{named}</span>?
          </h2>
        </div>

        <div className="flex flex-col gap-2 px-3.5 py-3">
          {/* The heading names the skill and its version, so this states the
              other half — where it goes from — as the system's own micro-label
              over its value, rather than a second sentence repeating the
              question above it. */}
          <div className="flex flex-col gap-1">
            <span className="m-label">Remove from</span>
            <span className="break-all font-mono text-fg-2 text-mono-sm">
              {target.kind === "repo" ? target.repoPath : "every detected tool"}
            </span>
          </div>
          {/* Mandatory on the global path: the trigger sits inside one tool's
              card, so the modal names the whole set before the user agrees to
              it. There is no per-tool remove to offer — apm's uninstall has no
              -t, and narrowing targets: to fake one orphans the other tools'
              files (apm-behavior.md § Remove, ADR-0013). */}
          {target.kind === "global" ? (
            <p className="font-ui text-body text-fg-2">
              This takes it off{" "}
              <span className="font-mono">{toolNameList(target.tools)}</span> in
              one go. There is no per-tool remove.
            </p>
          ) : null}
          {/* A global removal also force-deletes the whole copy of any tool
              this machine no longer detects — apm's own uninstall cannot
              reach it (#339). Named by tool and exact path so the confirmation
              states it before the user agrees; a path the preflight could not
              build is simply absent, never guessed. It goes beyond the row the
              user clicked, so it gets the same weight as the local-edits
              warning rather than a line of dim prose: amber, glyphed, and its
              own announced region, because a directory nobody targeted is the
              one thing here that must not be skimmed past. */}
          {reclaim.length > 0 ? (
            <div
              role="status"
              aria-label="Also deleted"
              className={cn("flex flex-col gap-1", WARNING_SURFACE)}
            >
              <p className="flex items-start gap-1.5 font-ui text-amber-ink text-desc">
                <span aria-hidden="true">▲</span>
                <span>
                  This also deletes {reclaim.length === 1 ? "a copy" : "copies"}{" "}
                  apm itself cannot reach, in full:
                </span>
              </p>
              <ul className="flex flex-col gap-1">
                {reclaim.map((entry) => {
                  // A tool is a target name, so it keeps the mono face inside
                  // the sans sentence around it (Mono-Is-Data).
                  const tool = (
                    <span className="font-mono">
                      {toolDisplayName(entry.tool)}
                    </span>
                  );
                  return (
                    <li key={entry.path} className="pl-4 font-ui text-desc">
                      {/* Only the path breaks mid-token: a long path has to fit,
                          but breaking the sentence around it mid-word makes the
                          loudest block on screen the hardest one to read. */}
                      <span className="break-all font-mono text-fg text-mono-sm">
                        {entry.path}
                      </span>
                      <span className="text-amber-ink">
                        {" "}
                        — the leftover {tool} copy, {tool} is not installed on
                        this machine.
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {/* Named, because the leftover block above is a status region too and
              the two say different things: one is what else goes, the other is
              what is inside it. Unnamed, a reader hears two identical regions. */}
          {preflight.kind === "warning" && preflight.warning !== "none" ? (
            <p
              role="status"
              aria-label="Local edits"
              className={cn(
                "flex items-start gap-1.5 font-ui text-amber-ink text-desc",
                WARNING_SURFACE,
              )}
            >
              <span aria-hidden="true">▲</span>
              <span>{WARNING_TEXT[preflight.warning]}</span>
            </p>
          ) : null}
          {/* The server's own refusal, in its own words. */}
          {preflight.kind === "refused" ? (
            <FailureNote
              label="this can't be removed"
              message={preflight.message}
            />
          ) : null}
          {/* Last of the prose, so the two loud blocks sit together. It states
              the cost and stops there: a redeploy re-pins to the latest
              published tag, so the removed version is not what would come back,
              and this dialog offers no comfort it cannot keep (#386). It
              describes a removal that is about to happen, so a refusal drops it
              rather than name a cost nothing will pay. */}
          {refused ? null : (
            <p className="font-ui text-desc text-dim">
              Its deployed files and its lockfile entry go.
            </p>
          )}
          {/* A removal the user confirmed and apm did not land. */}
          {error ? (
            <FailureNote label="the removal failed" message={error}>
              {/* Neutral rather than amber: a second signal colour inside a
                  danger block would read as a second, milder problem. */}
              {attempted ? (
                <span className="font-ui text-desc text-fg-2">
                  The repo may be in a mixed state — some of this skill's files
                  may already be gone. Check it before trying again.
                </span>
              ) : null}
            </FailureNote>
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
            disabled={isRemoving || awaitingCheck || refused}
            onClick={onConfirm}
          >
            {isRemoving ? `removing ${skillName}…` : `remove ${skillName}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
