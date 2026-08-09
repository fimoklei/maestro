import { type FormEvent, type ReactNode, useEffect, useRef } from "react";
import { Button } from "../ui/button";

// Presentational form for the offline connect flow, shared by the connect
// gate and Settings' re-point view (PRD #93). Path is a controlled prop, not
// local state, so a "browse…" picker selection can seed it from a container.
type ConnectInventoryFormProps = {
  path: string;
  onPathChange: (path: string) => void;
  onSubmit: (path: string) => void;
  error?: string | null;
  noUsableOrigin?: boolean;
  // A GitHub repository with no apm.yml: the refusal carries one offer, shown
  // in place of the plain error so the gate keeps its single field (#556).
  scaffoldOffer?: { path: string; onAccept: () => void; isPending: boolean };
  isPending?: boolean;
  onBrowse?: () => void;
  // Re-point flow overrides this so a returning user isn't told to "Connect"
  // a source they already have (#229).
  submitLabel?: string;
  secondaryAction?: ReactNode;
};

export function ConnectInventoryForm({
  path,
  onPathChange,
  onSubmit,
  error,
  noUsableOrigin = false,
  scaffoldOffer,
  isPending = false,
  onBrowse,
  submitLabel = "Connect inventory",
  secondaryAction,
}: ConnectInventoryFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // A rejected submit hands focus back to the field to fix (#214).
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
          placeholder="/path/to/agent-harness or https://github.com/owner/repo"
          aria-describedby={error ? "inventory-path-error" : undefined}
          // An offer is not a malformed field: the path is fine, it just has no
          // Harness in it yet.
          aria-invalid={error && !scaffoldOffer ? true : undefined}
          // No outline-none: it poisons --tw-outline-style and hides the ring (#227).
          className="flex-1 rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm placeholder:text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        />
        {onBrowse ? (
          <Button type="button" variant="quiet" size="sm" onClick={onBrowse}>
            browse…
          </Button>
        ) : null}
      </div>
      {isPending ? (
        // A clone has no honest percentage to show and nothing safe to cancel
        // mid-way, so the wait is stated in words. Worded for both routes: the
        // form is shared with Settings' re-point, which never clones (#554).
        <p role="status" className="text-dim text-tag">
          Connecting. A GitHub URL is being cloned first, which can take a
          minute — this stays open until it finishes.
        </p>
      ) : null}
      {error && scaffoldOffer ? (
        <div
          id="inventory-path-error"
          role="status"
          className="flex flex-col gap-1.5 rounded-control border border-line bg-inset px-3 py-2.5"
        >
          <span className="font-semibold text-fg text-tag">
            Not a Harness yet
          </span>
          <span className="text-fg-2 text-tag">{error}</span>
          <span className="font-mono text-dim text-mono-sm">
            {scaffoldOffer.path}
          </span>
          <div className="mt-1">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={scaffoldOffer.isPending}
              onClick={scaffoldOffer.onAccept}
            >
              {scaffoldOffer.isPending
                ? "Scaffolding…"
                : "Scaffold the Harness"}
            </Button>
          </div>
        </div>
      ) : error ? (
        noUsableOrigin ? (
          // Submit stays available (steps down to quiet) so a hand-corrected
          // path can still be resubmitted alongside "browse again…" (#147).
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
          // Steps down whenever the error region owns the primary action, so
          // the two never compete for the same weight (#147, #556).
          variant={noUsableOrigin || scaffoldOffer ? "quiet" : "primary"}
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
