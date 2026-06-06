import type { RegisteredRepo } from "./use-registry";

// Presentational list of registered repos. Empty state is explicit so the
// cockpit never shows a bare, ambiguous blank.
export function RegisteredReposList({ repos }: { repos: RegisteredRepo[] }) {
  if (repos.length === 0) {
    return <p>No repos registered yet.</p>;
  }

  return (
    <ul>
      {repos.map((repo) => (
        <li key={repo.path}>{repo.path}</li>
      ))}
    </ul>
  );
}
