import type { FormEvent } from "react";
import { Button } from "../ui/button";

// Presentational form for the offline connect flow: a labelled path input + a
// connect action. Extracted so the first-run wizard's connect step and the
// ⚙ Inventory source re-point view share it instead of duplicating it (PRD
// #93). The path is now a controlled prop, not local state — both the wizard's
// connect step and Settings need to seed/overwrite it from a "browse…" picker
// selection, which only a container-owned value allows (see frontend.md: this
// is UI-state, just owned one level up so two screens can drive it).
// Connecting is delegated to onSubmit so the data logic stays in the container
// hook. onBrowse is an optional hook point for a "browse…" picker — omit it and
// the form behaves exactly as the path-only variant. A validation error renders
// as readable text tied to the field via aria-describedby; the no-usable-origin
// refusal (#147) upgrades that text to an amber card with a "browse again…"
// call to action, since the fix is picking a different folder, not editing the
// path by hand. Styled from Control Room tokens.
type ConnectInventoryFormProps = {
  path: string;
  onPathChange: (path: string) => void;
  onSubmit: (path: string) => void;
  error?: string | null;
  noUsableOrigin?: boolean;
  isPending?: boolean;
  onBrowse?: () => void;
};

export function ConnectInventoryForm({
  path,
  onPathChange,
  onSubmit,
  error,
  noUsableOrigin = false,
  isPending = false,
  onBrowse,
}: ConnectInventoryFormProps) {
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
          id="inventory-path"
          name="inventory-path"
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          placeholder="/path/to/agent-harness"
          aria-describedby={error ? "inventory-path-error" : undefined}
          aria-invalid={error ? true : undefined}
          className="flex-1 rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm outline-none focus:border-line-chip"
        />
        {onBrowse ? (
          <Button type="button" variant="quiet" size="sm" onClick={onBrowse}>
            browse…
          </Button>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="primary" size="sm" disabled={isPending}>
          Connect inventory
        </Button>
      </div>
      {error ? (
        noUsableOrigin ? (
          <div
            id="inventory-path-error"
            role="alert"
            className="flex flex-col gap-2 rounded-control border border-amber-border bg-amber-bg px-3 py-2 text-amber-ink text-tag"
          >
            <span>● {error}</span>
            {onBrowse ? (
              <div>
                <Button
                  type="button"
                  variant="quiet"
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
            className="text-amber-ink text-tag"
          >
            {error}
          </p>
        )
      ) : null}
    </form>
  );
}
