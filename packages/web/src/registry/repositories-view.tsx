import { BrowseDialog } from "../shell/browse-dialog";
import { targetLabel } from "../shell/target-label";
import { useRegisterPicker } from "../shell/use-register-picker";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { Panel } from "../ui/panel";
import { useRegistry } from "./use-registry";

// The Repositories screen (#991): the registered consuming repositories, and
// the one control that registers another. Its table, per-row Status and
// Unregister arrive with the screen's own job; the frame job moves the
// function here from the sidebar so nothing becomes unreachable.

export function RepositoriesView() {
  const registry = useRegistry();
  const picker = useRegisterPicker();
  const repos = registry.data?.repos ?? [];
  // Whole set drives each label so shared-prefix repos stay distinct (#211).
  const repoPaths = repos.map((repo) => repo.path);

  return (
    <Panel
      title="Repositories"
      meta={
        registry.isSuccess
          ? `${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`
          : undefined
      }
      action={
        <Button variant="primary" onClick={picker.openPicker}>
          Register repository
        </Button>
      }
    >
      <div className="flex flex-col gap-cell p-panel">
        {/* The region outlives its content, so it is mounted before the
            failure is (#465). */}
        <Notice
          trigger="load"
          notice={
            registry.isError
              ? {
                  level: "error",
                  label: "Registered repositories not read",
                  message:
                    "Select Re-read Repositories to read the registered repositories again.",
                }
              : null
          }
        />
        {repos.length > 0 ? (
          <ul
            aria-label="Registered repositories"
            className="m-0 flex list-none flex-col p-0"
          >
            {repos.map((repo) => (
              <li
                key={repo.path}
                className="flex h-row items-center gap-cell border-gray-7 border-b px-cell"
              >
                <span className="truncate font-medium text-gray-12 text-row">
                  {targetLabel(repo.path, repoPaths)}
                </span>
                <span
                  title={repo.path}
                  className="truncate font-mono text-gray-11 text-row"
                >
                  {repo.path}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {registry.isSuccess && repos.length === 0 ? (
          <div className="flex flex-col gap-tight">
            <p className="m-0 font-medium text-gray-12 text-prose">
              No repositories yet
            </p>
            <p className="m-0 text-gray-11 text-prose">
              Select Register repository to add the repositories you deploy
              skills to.
            </p>
          </div>
        ) : null}
      </div>
      {picker.open ? <BrowseDialog {...picker.dialogProps} /> : null}
    </Panel>
  );
}
