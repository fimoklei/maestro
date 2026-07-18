import type { FormEvent } from "react";
import { Button } from "../ui/button";

// Presentational form: a labelled path input + submit. The path is a controlled
// prop, not local state — the wizard's register step needs to seed it from a
// "browse…" picker selection and clear it after a successful add, which only a
// container-owned value allows (mirrors ConnectInventoryForm). Registering is
// delegated to onSubmit so the data logic stays in the container hook (see
// .claude/rules/frontend.md). onBrowse is an optional hook point for a
// "browse…" picker — omit it and the form behaves as the path-only variant.
// Errors render as readable text tied to the field via aria-describedby.
type RegisterRepoFormProps = {
  path: string;
  onPathChange: (path: string) => void;
  onSubmit: (path: string) => void;
  error?: string | null;
  isPending?: boolean;
  onBrowse?: () => void;
};

export function RegisterRepoForm({
  path,
  onPathChange,
  onSubmit,
  error,
  isPending = false,
  onBrowse,
}: RegisterRepoFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(path);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="repo-path" className="m-label">
        Repo path
      </label>
      <div className="flex items-end gap-2">
        <input
          id="repo-path"
          name="repo-path"
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          aria-describedby={error ? "repo-path-error" : undefined}
          aria-invalid={error ? true : undefined}
          className="flex-1 rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm outline-none focus:border-line-chip"
        />
        {onBrowse ? (
          // Closed while a registration is in flight: reopening the picker
          // mid-run would start a second registration loop alongside the
          // first, interleaving their outcomes (issue #151).
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={onBrowse}
            disabled={isPending}
          >
            browse…
          </Button>
        ) : null}
      </div>
      <Button type="submit" variant="dashed" size="sm" disabled={isPending}>
        + register repo
      </Button>
      {error ? (
        <p
          id="repo-path-error"
          role="alert"
          className="text-amber-ink text-tag"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
