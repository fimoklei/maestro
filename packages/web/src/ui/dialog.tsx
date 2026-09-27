import type { ReactNode } from "react";
import { ACTIONS, type ActionKey } from "./busy-copy";
import { Button } from "./button";
import { DialogHeader } from "./dialog-header";
import { DIALOG_CANCEL, DIALOG_FOOTER, DialogShell } from "./dialog-shell";
import { Notice, type NoticeContent } from "./notice";
import { Tooltip } from "./tooltip";

const CANCEL = "Cancel";
const CLOSE = "Close";

export type DialogAction = {
  label: string;
  /** Picks the busy label from `busy-copy`. */
  verb: ActionKey;
  /** `danger` is a destructive dialog: danger button, focus opens on Cancel. */
  tone: "primary" | "danger";
  /** Why it cannot run yet, in five words or fewer; `null` when it can. */
  unavailable: string | null;
  onRun: () => void;
};

export type DialogProps = {
  /** Names in the title are set in Geist. */
  title: string;
  /** The one mono part, appended to the title. */
  version: string | null;
  width: 480 | 640;
  phase: "idle" | "running" | "outcome";
  /** `null`: no action, as once an outcome is shown. */
  action: DialogAction | null;
  /** Stated directly above the footer. */
  failure: NoticeContent | null;
  describedBy: string | null;
  fieldsChanged: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function Dialog({
  title,
  version,
  width,
  phase,
  action,
  failure,
  describedBy,
  fieldsChanged,
  onClose,
  children,
}: DialogProps) {
  const running = phase === "running";
  const leave = phase === "outcome" || failure !== null ? CLOSE : CANCEL;
  const lone = phase === "outcome" && action === null;
  const danger = action?.tone === "danger";
  // One primary per view: a failure's own action takes it.
  const variant = danger
    ? "danger"
    : failure?.action === undefined
      ? "primary"
      : "quiet";

  return (
    <DialogShell
      label={version === null ? title : `${title} ${version}`}
      describedBy={describedBy}
      width={width}
      onClose={onClose}
      closeEnabled={!running}
      destructive={danger}
      focusField
      fieldsChanged={fieldsChanged}
    >
      <DialogHeader
        title={title}
        version={version}
        busy={running}
        onClose={onClose}
      />
      {/* One form, so Enter in a field runs the action. */}
      <form
        className="flex min-h-0 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          // aria-disabled does not stop Enter from submitting, so the refusal
          // lives here.
          if (action !== null && !running && action.unavailable === null) {
            action.onRun();
          }
        }}
      >
        <div className="flex min-h-0 flex-col gap-cell overflow-y-auto p-panel font-ui text-gray-12 text-prose">
          {children}
        </div>
        {/* Outside the scrolling body, so a long body never hides it. */}
        <div
          className={
            failure === null ? undefined : "shrink-0 px-panel pb-panel"
          }
        >
          <Notice trigger="user-action" notice={failure} />
        </div>
        <div className={DIALOG_FOOTER}>
          <Button
            variant={lone ? "primary" : "quiet"}
            className={lone ? "ml-auto" : undefined}
            disabled={running}
            {...DIALOG_CANCEL}
            onClick={onClose}
          >
            {leave}
          </Button>
          {action === null ? null : (
            <ActionButton action={action} variant={variant} running={running} />
          )}
        </div>
      </form>
    </DialogShell>
  );
}

// Submits the form, which owns the refusals; it never runs the action itself.
function ActionButton({
  action,
  variant,
  running,
}: {
  action: DialogAction;
  variant: "primary" | "danger" | "quiet";
  running: boolean;
}) {
  if (action.unavailable === null) {
    return (
      <Button type="submit" variant={variant} busy={running}>
        {running ? ACTIONS[action.verb].busy : action.label}
      </Button>
    );
  }
  const name = `${action.label} — ${action.unavailable}`;
  return (
    <Tooltip label={name}>
      <Button
        type="submit"
        variant={variant}
        aria-label={name}
        aria-disabled
        // A blocked action reads as a disabled control, never as on offer.
        className="aria-disabled:border-edge aria-disabled:bg-gray-3 aria-disabled:text-gray-11"
      >
        {action.label}
      </Button>
    </Tooltip>
  );
}
