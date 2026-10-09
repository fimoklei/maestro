import * as Radix from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useContext, useEffect, useId, useRef } from "react";
import { ACTIONS, type ActionKey } from "./busy-copy";
import { Button } from "./button";
import { cn } from "./cn";
import { ACTION_STILL_RUNNING, CANCEL, CLOSE } from "./dialog-copy";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { Notice, type NoticeContent } from "./notice";
import { ScreenFocusContext } from "./screen-focus";
import { Tooltip } from "./tooltip";

// Radix owns the portal, focus trap, focus return and scroll lock (#997); this
// module owns the frame, and derives the rest from the phase and the action.

// The leave control a destructive dialog opens its focus on.
const CANCEL_MARK = "data-dialog-cancel";

// Tailwind reads whole class names, so each is written out.
const WIDTH = {
  480: "max-w-[480px]",
  640: "max-w-[640px]",
} as const;

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
  /** `null`: no body, as when a failure is all the dialog has to say. */
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
  const failureId = useId();
  const bodyless = children === null;

  // Below a long body a new failure would sit out of view; focus stays put.
  const failureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (failure !== null)
      failureRef.current?.scrollIntoView({ block: "nearest" });
  }, [failure]);

  const panelRef = useRef<HTMLDivElement>(null);
  const screenFocus = useContext(ScreenFocusContext);
  // Radix returns focus to its own Trigger, which these dialogs never use.
  const openerRef = useRef<Element | null>(
    typeof document === "undefined" ? null : document.activeElement,
  );

  return (
    <Radix.Root
      open
      onOpenChange={(open) => {
        if (!open && !running) onClose();
      }}
    >
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-50 bg-backdrop" />
        <Radix.Content
          ref={panelRef}
          aria-modal="true"
          aria-label={version === null ? title : `${title} ${version}`}
          aria-describedby={
            (bodyless && failure !== null ? failureId : describedBy) ??
            undefined
          }
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            // The cockpit's Select is a combobox button; the native select
            // Radix hides beside it for form submits is skipped.
            const target = danger
              ? `[${CANCEL_MARK}]`
              : "input:not([disabled]), textarea:not([disabled]), select:not([disabled]):not([aria-hidden]), [role=combobox]:not([disabled])";
            const landing =
              panelRef.current?.querySelector<HTMLElement>(target);
            // Opened by mouse, Cancel would otherwise take focus unseen.
            (landing ?? panelRef.current)?.focus({ focusVisible: danger });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A close that sent the reader on — a pane that took focus — keeps
            // them there; only a lost focus goes back to the opener.
            const active = document.activeElement;
            const lost =
              active === null ||
              active === document.body ||
              panelRef.current?.contains(active) === true;
            if (!lost) return;
            // An opener that left with its row, or never stood (a ⋮ item that
            // opened a pane and this dialog), leaves it to the screen.
            const opener = openerRef.current;
            if (
              opener instanceof HTMLElement &&
              opener !== document.body &&
              opener.isConnected
            ) {
              opener.focus();
            } else {
              screenFocus?.();
            }
          }}
          onInteractOutside={(event) => {
            // A click outside must not discard typed work.
            if (running || fieldsChanged) event.preventDefault();
          }}
          className={cn(
            // Top-aligned, not centred: a growing dialog keeps its header
            // still. Capped, so a long body scrolls instead of pushing the
            // footer off the screen.
            "-translate-x-1/2 fixed top-24 left-1/2 z-50 flex max-h-[calc(100vh-9rem)] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-float border border-gray-7 bg-gray-2 shadow-float outline-none",
            WIDTH[width],
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between gap-inline border-edge border-b pr-cell pl-panel">
            <h2 className="m-0 truncate font-semibold font-ui text-gray-12 text-heading">
              {title}
              {version === null ? null : (
                <>
                  {" "}
                  <span className="font-mono">{version}</span>
                </>
              )}
            </h2>
            <IconButton
              label={CLOSE}
              variant="ghost"
              unavailable={running ? ACTION_STILL_RUNNING : undefined}
              onClick={onClose}
            >
              <Icon of={X} />
            </IconButton>
          </div>
          {/* One form, so Enter in a field runs the action. */}
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              // aria-disabled does not stop Enter from submitting, so the
              // refusal lives here.
              if (action !== null && !running && action.unavailable === null) {
                action.onRun();
              }
            }}
          >
            {/* Only the footer stays outside the scroll, so a tall failure at
                200% zoom never pushes it off the panel. */}
            <div
              className={cn(
                "flex min-h-0 flex-col gap-cell overflow-y-auto font-ui text-gray-12 text-prose",
                bodyless && failure === null ? null : "p-panel",
              )}
            >
              {children}
              <div
                ref={failureRef}
                // Out of flow while empty, so it adds no gap under the body.
                className={failure === null ? "sr-only" : undefined}
              >
                <Notice id={failureId} trigger="user-action" notice={failure} />
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-inline border-edge border-t px-panel py-cell">
              <Button
                variant={lone ? "primary" : "quiet"}
                className={lone ? "ml-auto" : undefined}
                disabled={running}
                {...{ [CANCEL_MARK]: "" }}
                onClick={onClose}
              >
                {leave}
              </Button>
              {action === null ? null : (
                <ActionButton
                  action={action}
                  variant={variant}
                  running={running}
                />
              )}
            </div>
          </form>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
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
