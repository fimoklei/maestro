import { type FormEvent, useState } from "react";

// Presentational form: a labelled path input + submit. The path is local
// UI-state (useState); registering is delegated to onSubmit so the data logic
// stays in the container hook (see .claude/rules/frontend.md). Errors render as
// readable text tied to the field via aria-describedby.
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
    <form onSubmit={handleSubmit}>
      <label htmlFor="repo-path">Repo path</label>
      <input
        id="repo-path"
        name="repo-path"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        aria-describedby={error ? "repo-path-error" : undefined}
        aria-invalid={error ? true : undefined}
      />
      <button type="submit" disabled={isPending}>
        Register
      </button>
      {error ? (
        <p id="repo-path-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
