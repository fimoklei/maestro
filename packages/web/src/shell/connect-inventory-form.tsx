import { type FormEvent, type ReactNode, useEffect, useRef } from "react";
import { Button } from "../ui/button";

// Presentational form for the offline connect flow: a labelled path input + a
// connect action. Extracted so the connect gate's connect step and the
// ⚙ Inventory source re-point view share it instead of duplicating it (PRD
// #93). The path is now a controlled prop, not local state — both the connect gate's
// connect step and Settings need to seed/overwrite it from a "browse…" picker
// selection, which only a container-owned value allows (see frontend.md: this
// is UI-state, just owned one level up so two screens can drive it).
// Connecting is delegated to onSubmit so the data logic stays in the container
// hook. onBrowse is an optional hook point for a "browse…" picker — omit it and
// the form behaves exactly as the path-only variant. A validation error renders
// as danger-red text with a glyph (issue #213: errors no longer wear amber, the
// act colour), tied to the field via aria-describedby and placed directly under
// it. The no-usable-origin refusal (#147) upgrades that to a danger card with a
// "browse again…" call to action, since the fix is picking a different folder,
// not editing the path by hand; while it shows, the submit action steps down to
// the quiet variant so the card's "browse again…" is the one amber action.
// Styled from Control Room tokens.
type ConnectInventoryFormProps = {
  path: string;
  onPathChange: (path: string) => void;
  onSubmit: (path: string) => void;
  error?: string | null;
  noUsableOrigin?: boolean;
  isPending?: boolean;
  onBrowse?: () => void;
  // Defaults to first-time-setup wording; the re-point flow overrides it so a
  // returning user isn't told to "Connect" a source they already have (#229).
  submitLabel?: string;
  // Optional trailing action rendered on the same row as submit, so a re-point
  // flow's "Cancel" pairs with its primary instead of orphaning below it. The
  // connect gate omits it and the row holds submit alone, exactly as before.
  secondaryAction?: ReactNode;
};

export function ConnectInventoryForm({
  path,
  onPathChange,
  onSubmit,
  error,
  noUsableOrigin = false,
  isPending = false,
  onBrowse,
  submitLabel = "Connect inventory",
  secondaryAction,
}: ConnectInventoryFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // A rejected submit must hand focus back to the field to fix, not leave it on
  // the page (issue #214). The error prop appearing is the signal a submit
  // failed, so focus follows it in.
  useEffect(() => {
    if (error) {
      inputRef.current?.focus();
    }
  }, [error]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(path);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="inventory-path" className="m-label">
        Inventory path
      </label>
      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          id="inventory-path"
          name="inventory-path"
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="/path/to/agent-harness"
          aria-describedby={error ? "inventory-path-error" : undefined}
          aria-invalid={error ? true : undefined}
          // Keyboard focus shows the same tokenized amber ring as the shared
          // Button; the near-invisible border delta is gone (issue #227). No
          // outline-none: it poisons --tw-outline-style and hides the ring.
          className="flex-1 rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        />
        {onBrowse ? (
          <Button type="button" variant="quiet" size="sm" onClick={onBrowse}>
            browse…
          </Button>
        ) : null}
      </div>
      {error ? (
        noUsableOrigin ? (
          // Design f1-connect-reject: ✕ + bold title, explanation in muted
          // text, "browse again…" as the primary next action. The submit
          // button below stays (unlike the design frame) so a hand-corrected
          // path can still be resubmitted, but steps down to quiet so this
          // card's "browse again…" is the single amber action.
          <div
            id="inventory-path-error"
            role="alert"
            className="flex flex-col gap-1.5 rounded-control border border-danger-border bg-danger-bg px-3 py-2.5"
          >
            <span className="font-semibold text-danger-ink text-tag">
              <span aria-hidden="true">✕ </span>no usable git origin
            </span>
            <span className="text-fg-2 text-tag">{error}</span>
            {onBrowse ? (
              <div className="mt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={onBrowse}
                >
                  browse again…
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p
            id="inventory-path-error"
            role="alert"
            className="flex items-center gap-1.5 text-danger-ink text-tag"
          >
            <span aria-hidden="true">✕</span>
            {error}
          </p>
        )
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={noUsableOrigin ? "quiet" : "primary"}
          size="sm"
          disabled={isPending}
        >
          {submitLabel}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
