import { type FormEvent, useState } from "react";
import { Button } from "../ui/button";

// Presentational form for the offline connect flow: a labelled path input + a
// connect action. Extracted so the first-run wizard's connect step and the
// future ⚙ Inventory source re-point view can share it instead of duplicating
// it (PRD #93) — today both roles are still served by one ConnectView, but the
// form itself no longer assumes that. The path is local UI-state (useState);
// connecting is delegated to onSubmit so the data logic stays in the container
// hook (see .claude/rules/frontend.md). onBrowse is an optional hook point for
// a "browse…" picker — omit it and the form behaves exactly as the path-only
// variant; wiring the picker itself is a later slice. A validation error
// renders as readable text tied to the field via aria-describedby. Styled from
// Control Room tokens.
type ConnectInventoryFormProps = {
  onSubmit: (path: string) => void;
  initialPath?: string;
  error?: string | null;
  isPending?: boolean;
  onBrowse?: () => void;
};

export function ConnectInventoryForm({
  onSubmit,
  initialPath = "",
  error,
  isPending = false,
  onBrowse,
}: ConnectInventoryFormProps) {
  const [path, setPath] = useState(initialPath);

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
          onChange={(event) => setPath(event.target.value)}
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
        <p
          id="inventory-path-error"
          role="alert"
          className="text-amber-ink text-tag"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
