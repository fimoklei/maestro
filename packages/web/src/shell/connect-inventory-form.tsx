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
          placeholder="/path/to/agent-harness"
          aria-describedby={error ? "inventory-path-error" : undefined}
          aria-invalid={error ? true : undefined}
          // No outline-none: it poisons --tw-outline-style and hides the ring (#227).
          className="flex-1 rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm placeholder:text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        />
        {onBrowse ? (
          <Button type="button" variant="quiet" size="sm" onClick={onBrowse}>
            browse…
          </Button>
        ) : null}
      </div>
      {error ? (
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
