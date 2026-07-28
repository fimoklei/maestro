import { type ReactNode, useId } from "react";
import { useModalDialog } from "../shell/use-modal-dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { TypeTag } from "../ui/type-tag";
import type {
  RemovePreflightView,
  RemoveWarningState,
} from "./remove-preflight-view";
import { toolDisplayName } from "./tool-labels";

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
// an unfinished check cannot promise (J04) — but it is the one line here that
// names no cost, so it is the one line that wears neither the amber nor the ▲.
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
// identical, and one owner is what keeps them that way. A check that has not
// answered yet wears none of it: the surface is the claim, and an unfinished
// check has made no claim.
const WARNING_SURFACE =
  "rounded-control border border-amber-border bg-amber-bg px-2.5 py-2.5";

// Every block in this panel that leads with a glyph hangs it in the margin and
// aligns its lines against each other, so a wrapped sentence and a second line
// start where the first one did. Indenting by a guessed padding instead put the
// amber block's list 2px off its own intro.
const GLYPH_BLOCK = "flex gap-1.5";

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
  id,
  label,
  message,
  children,
}: {
  id?: string;
  label: string;
  message: string;
  // Anything the failure adds beyond the server's own sentence.
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        GLYPH_BLOCK,
        "rounded-control border border-danger-border bg-danger-bg px-2.5 py-2.5",
      )}
    >
      <span aria-hidden="true" className="font-mono text-danger-ink text-desc">
        ✕
      </span>
      {/* Label and message share one size and differ by weight and ink. The
          label used to be the smallest text in the panel under the largest, so
          the box named its problem more quietly than it explained it. */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold font-ui text-danger-ink text-desc">
          {label}
        </span>
        <span className="font-ui text-desc text-fg-2">{message}</span>
        {children}
      </div>
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
  // A removal the server has already refused. The ledger still states what the
  // removal was aimed at — that is the question the panel asked, and a refusal
  // answers it rather than unasks it — but the confirm goes, because there is
  // nothing left to consent to.
  const refused = preflight.kind === "refused";
  // Only ever the leftovers the check in hand named. A refusal carries none, so
  // an earlier answer's paths cannot outlive the answer that named them.
  const reclaim = preflight.kind === "warning" ? preflight.reclaim : [];
  // The three answers that name a cost, which are the only ones that earn the
  // amber surface. `checking` is deliberately not among them: it used to wear
  // the same alarm as "this copy has local edits", so the loudest block in the
  // panel appeared and then vanished again on every removal of a clean copy.
  const costWarning =
    preflight.kind === "warning" &&
    preflight.warning !== "none" &&
    preflight.warning !== "checking"
      ? preflight.warning
      : null;

  // What the removal is aimed at, one entry per thing that disappears. The
  // global scope keeps the order it was handed: the panel states the set the
  // host detected, and re-sorting it here would make the confirmation disagree
  // with the cards the user just came from.
  const targets =
    target.kind === "repo"
      ? [target.repoPath]
      : target.tools.map((tool) => toolDisplayName(tool));

  // The question and the targets it would take are announced as one statement,
  // so the confirmation is heard rather than arrowed through. The warning and
  // failure blocks announce themselves and stay out of it. One id per row
  // rather than one wrapping the ledger: a list of references is joined with a
  // space by definition, where the text inside a single element is at the mercy
  // of how each reader flattens it — and two tool names running together is the
  // one reading this description cannot afford.
  const dialogId = useId();
  const leadInId = `${dialogId}-lead-in`;
  const rowId = (index: number) => `${dialogId}-target-${index}`;
  const describedBy = [
    leadInId,
    ...targets.map((_, index) => rowId(index)),
  ].join(" ");
  // Why the confirm control is unavailable, tied to the control itself: a
  // disabled button with the reason elsewhere on screen states it to sighted
  // users alone. Same wiring as the browse dialog's `↑ up` at its ceiling.
  const blockedId =
    refused || awaitingCheck ? `${dialogId}-blocked` : undefined;

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
        aria-describedby={describedBy}
        tabIndex={-1}
        className="relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-card border border-line bg-chrome outline-none"
      >
        <div className="flex items-center justify-between gap-2.5 border-line-row border-b px-3.5 py-3">
          {/* "Remove" and "?" are chrome; the name and version are data, so
              they take the mono face inside the sans question (Mono-Is-Data). */}
          <h2 className="font-semibold font-ui text-fg text-subtitle">
            Remove <span className="font-mono">{named}</span>?
          </h2>
          {/* What kind of thing is going, in the chip the inventory and the
              detail pane already use. Only skills reach this dialog today —
              `DeployedPrimitive.type` is the literal "skill" — so the type is
              stated, not guessed. */}
          <TypeTag type="skill" className="shrink-0" />
        </div>

        {/* Two groups, not one stack: what the removal is aimed at, then what
            it costs. They used to sit at one uniform gap, which left the panel
            a column of unrelated lines with no way in. Space does the grouping
            — a rule between them would put four hairlines across a panel this
            short. */}
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <div className="flex flex-col gap-2">
            {/* One lead-in, then the answer. The panel used to spend three
                prose lines on the scope — a micro-label, a summary value, and a
                sentence naming the set — where a reader only ever needed the
                list itself. */}
            <span id={leadInId} className="font-ui text-desc text-muted">
              Primitive will be removed from:
            </span>
            {/* The ledger. Rows are static text: there is no per-tool remove to
                offer — apm's uninstall has no -t, and faking one orphans the
                other tools' files (apm-behavior.md § Remove, ADR-0013) — so
                nothing on a row may carry a control or a glyph that reads as
                one. The sentence that used to say so is gone; a row with
                nothing to press says it without spending a line. */}
            <ul className="flex flex-col overflow-hidden rounded-item border border-line-row">
              {targets.map((name, index) => (
                <li
                  key={name}
                  id={rowId(index)}
                  // A path has no spaces to break at, so without break-all it
                  // sets the panel's width instead of fitting inside it.
                  className="break-all border-line-faint border-b bg-inset px-3 py-2.5 font-mono text-data text-fg last:border-b-0"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
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
                className={cn(GLYPH_BLOCK, WARNING_SURFACE)}
              >
                <span
                  aria-hidden="true"
                  className="font-mono text-amber-ink text-desc"
                >
                  ▲
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-ui text-amber-ink text-desc">
                    This also deletes{" "}
                    {reclaim.length === 1 ? "a copy" : "copies"} apm itself
                    cannot reach, in full:
                  </p>
                  <ul className="flex flex-col gap-1">
                    {reclaim.map((entry) => (
                      <li key={entry.path} className="font-ui text-desc">
                        {/* Only the path breaks mid-token: a long path has to
                            fit, but breaking the sentence around it mid-word
                            makes the loudest block on screen the hardest one to
                            read. It is set at the size of the sentence it sits
                            in, so mono and sans share a baseline instead of
                            stepping over each other. */}
                        <span className="break-all font-mono text-fg">
                          {entry.path}
                        </span>
                        {/* A tool is a target name, so it keeps the mono face
                            inside the sans sentence around it (Mono-Is-Data).
                            Named once: the sentence used to say it twice in
                            nine words, across a comma splice. */}
                        <span className="text-amber-ink">
                          {" "}
                          — the leftover copy for{" "}
                          <span className="font-mono">
                            {toolDisplayName(entry.tool)}
                          </span>
                          , which is not installed on this machine.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {/* Named, because the leftover block above is a status region too
                and the two say different things: one is what else goes, the
                other is what is inside it. Unnamed, a reader hears two identical
                regions. One name across every answer the check can give, since
                they are all the same region reporting the same check. */}
            {costWarning !== null ? (
              <p
                role="status"
                aria-label="Local-edits check"
                className={cn(
                  GLYPH_BLOCK,
                  "font-ui text-amber-ink text-desc",
                  WARNING_SURFACE,
                )}
              >
                <span aria-hidden="true" className="font-mono">
                  ▲
                </span>
                <span>{WARNING_TEXT[costWarning]}</span>
              </p>
            ) : null}
            {/* The server's own refusal, in its own words. */}
            {preflight.kind === "refused" ? (
              <FailureNote
                id={blockedId}
                label="this can't be removed"
                message={preflight.message}
              />
            ) : null}
            {/* A removal the user confirmed and apm did not land. */}
            {error ? (
              <FailureNote label="the removal failed" message={error}>
                {/* Neutral rather than amber: a second signal colour inside a
                    danger block would read as a second, milder problem. */}
                {attempted ? (
                  <span className="font-ui text-desc text-fg-2">
                    The repo may be in a mixed state — some of this skill's
                    files may already be gone. Check it before trying again.
                  </span>
                ) : null}
              </FailureNote>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-line-row border-t px-3.5 py-3">
          {/* The check speaks while it runs, because silence would read as
              nothing-to-lose (J04) — but here, beside the control it is holding,
              rather than in the body wearing the amber of an answered warning.
              It is a statement about the confirm button, the same place and the
              same shape as the browse dialog's reason for a disabled `↑ up`.
              Keeping it out of the body also keeps the panel's height steady
              between "checking" and the clean answer that usually follows, so
              the confirm control does not jump under the pointer. */}
          {awaitingCheck ? (
            <p
              id={blockedId}
              role="status"
              aria-label="Local-edits check"
              className="min-w-0 truncate font-ui text-desc text-dim"
            >
              {WARNING_TEXT.checking}
            </p>
          ) : null}
          <span className="flex-1" />
          {/* The way out never shrinks: it is fixed-length text, and squeezing
              it to make room for a long name is the wrong thing to give up. */}
          <Button
            type="button"
            className="shrink-0"
            variant="quiet"
            size="sm"
            disabled={isRemoving}
            onClick={onCancel}
          >
            cancel
          </Button>
          {/* Fixed-length, like the way out beside it. The label used to carry
              the skill name inside a fixed-width panel, so it had to shrink and
              ellipsise to fit (#388); the title states the name and version, so
              repeating it here bought nothing and cost the footer its shape. */}
          <Button
            type="button"
            className="shrink-0"
            variant="primary"
            size="sm"
            disabled={isRemoving || awaitingCheck || refused}
            aria-describedby={blockedId}
            onClick={onConfirm}
          >
            {isRemoving ? "removing…" : "remove →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
