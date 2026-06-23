import { type FormEvent, useState } from "react";
import { Button } from "../ui/button";

// Presentational form: a labelled path input + submit. The path is local
// UI-state (useState); registering is delegated to onSubmit so the data logic
// stays in the container hook (see .claude/rules/frontend.md). Errors render as
// readable text tied to the field via aria-describedby. Styled from tokens so it
// reads in the cockpit sidebar (the input is visible on the dark surface).
type RegisterRepoFormProps = {
  onSubmit: (path: string) => void;
  error?: string | null;
  isPending?: boolean;
};

export function RegisterRepoForm({
  onSubmit,
  error,
  isPending = false,
}: RegisterRepoFormProps) {
  const [path, setPath] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(path);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="repo-path" className="m-label">
        Repo path
      </label>
      <input
        id="repo-path"
        name="repo-path"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        aria-describedby={error ? "repo-path-error" : undefined}
        aria-invalid={error ? true : undefined}
        className="rounded-control border border-line bg-inset px-2 py-1.5 font-mono text-fg text-mono-sm outline-none focus:border-line-chip"
      />
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
