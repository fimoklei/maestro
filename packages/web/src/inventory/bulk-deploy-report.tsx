import type { DeploySkillError } from "@maestro/core";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import type { BulkDeployReportView } from "./bulk-deploy-report-view";

// The bulk-deploy report: one summary line naming the target and the outcome
// counts, with per-skill detail on expand (#292). Presentational — the colour,
// counts, and rows are already folded by bulkDeployReportView. A diverged
// "attention" row offers a force reinstall, wired to the caller's onForce.

// A terse, human label per refusal code for a report row. The server owns the
// full actionable sentence; here a compact phrase keeps the row scannable.
const errorLabels: Partial<Record<DeploySkillError, string>> = {
  "deployed-diverged-from-lock": "deployed copy has local changes",
  "deployed-unverifiable": "deployed copy predates content tracking",
  "local-diverged-from-tag": "local copy diverged from its tag",
  "no-published-tag": "no published tag contains it",
  "auth-required": "GitHub authentication is missing or expired",
  "deploy-failed": "the deploy could not be completed",
};

function errorLabel(error: DeploySkillError): string {
  return errorLabels[error] ?? error;
}

export function BulkDeployReport({
  view,
  isDeploying = false,
  onForce,
}: {
  view: BulkDeployReportView;
  isDeploying?: boolean;
  onForce?: (name: string) => void;
}) {
  const { counts } = view;
  const summary = isDeploying
    ? "Deploying…"
    : `Deployed to ${view.targetLabel} · ${counts.deployed} deployed · ${counts.skipped} skipped · ${counts.attention} attention · ${counts.failed} failed`;

  return (
    <div className="mx-card-x mb-row-y">
      {/* An off-screen live region announces the one-shot result without moving
          focus; the visible summary carries the same line and toggles detail. */}
      <span
        role="status"
        aria-live="polite"
        aria-label="Bulk deploy result"
        className="sr-only"
      >
        {summary}
      </span>
      <details className="rounded-control border border-line bg-inset px-card-x py-row-y">
        <summary
          className={
            view.tone === "success"
              ? "cursor-pointer font-mono text-green-ink text-mono-sm"
              : "cursor-pointer font-mono text-amber-ink text-mono-sm"
          }
        >
          {summary}
        </summary>

        <div className="mt-row-y flex flex-col gap-row-y">
          {view.deployed.length > 0 ? (
            <ul aria-label="Deployed" className="flex flex-col gap-1">
              {view.deployed.map((row) => (
                <li
                  key={row.name}
                  className="flex items-baseline gap-2 text-tag"
                >
                  <span className="text-green-ink">✓</span>
                  <span className="font-mono text-fg text-mono-sm">
                    {row.name}
                  </span>
                  <span className="text-dim">{row.version}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {view.updated.length > 0 ? (
            <ul aria-label="Updated to latest" className="flex flex-col gap-1">
              {view.updated.map((row) => (
                <li
                  key={row.name}
                  className="flex items-baseline gap-2 text-tag"
                >
                  <span className="text-green-ink">↑</span>
                  <span className="font-mono text-fg text-mono-sm">
                    {row.name}
                  </span>
                  <span className="text-dim">{row.version}</span>
                  <span className="text-muted">updated to latest</span>
                </li>
              ))}
            </ul>
          ) : null}

          {view.attention.length > 0 ? (
            <ul aria-label="Needs attention" className="flex flex-col gap-1">
              {view.attention.map((row) => (
                <li
                  key={row.name}
                  className="flex items-baseline justify-between gap-2 text-tag"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <Chip tone="drift">▲ attention</Chip>
                    <span className="font-mono text-fg text-mono-sm">
                      {row.name}
                    </span>
                    <span className="truncate text-amber-ink">
                      {errorLabel(row.error)}
                    </span>
                  </span>
                  {onForce ? (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => onForce(row.name)}
                    >
                      Reinstall fresh {row.name}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {view.failed.length > 0 ? (
            <ul aria-label="Failed" className="flex flex-col gap-1">
              {view.failed.map((row) => (
                <li
                  key={row.error}
                  className="flex items-baseline gap-2 text-tag"
                >
                  <span className="text-amber-ink">✕</span>
                  <span className="font-mono text-fg text-mono-sm">
                    {row.names.join(", ")}
                  </span>
                  <span className="text-amber-ink">
                    {errorLabel(row.error)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {view.skipped.length > 0 ? (
            <ul
              aria-label="Skipped, already up to date"
              className="flex flex-col gap-1"
            >
              {view.skipped.map((name) => (
                <li key={name} className="flex items-baseline gap-2 text-tag">
                  <span className="text-dim">–</span>
                  <span className="font-mono text-muted text-mono-sm">
                    {name}
                  </span>
                  <span className="text-dim">already up to date</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}
