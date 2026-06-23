import { type FormEvent, useState } from "react";
import { Button } from "../ui/button";

// Presentational form for the offline connect flow: a labelled path input + a
// connect action. The path is local UI-state (useState); connecting is delegated
// to onSubmit so the data logic stays in the container hook (see
// .claude/rules/frontend.md). A validation error renders as readable text tied
// to the field via aria-describedby. Styled from Control Room tokens.
type ConnectInventoryFormProps = {
  onSubmit: (path: string) => void;
  error?: string | null;
  isPending?: boolean;
};

export function ConnectInventoryForm({
  onSubmit,
  error,
  isPending = false,
}: ConnectInventoryFormProps) {
  const [path, setPath] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(path);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="inventory-path" className="m-label">
        Inventory path
      </label>
      <input
        id="inventory-path"
        name="inventory-path"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        placeholder="/path/to/agent-harness"
        aria-describedby={error ? "inventory-path-error" : undefined}
        aria-invalid={error ? true : undefined}
        className="rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm outline-none focus:border-line-chip"
      />
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
