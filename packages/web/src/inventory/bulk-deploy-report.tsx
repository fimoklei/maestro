import type { DeploySkillError } from "@maestro/core";
import { Button } from "../ui/button";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import {
  type BulkDeployReportView,
  bulkDeploySummary,
} from "./bulk-deploy-report-view";

// One summary line + per-skill detail on expand (#292). Presentational —
// colour, counts, rows already folded by bulkDeployReportView.

// Terse label per code — the server owns the full sentence.
const errorLabels: Partial<Record<DeploySkillError, string>> = {
  "deployed-diverged-from-lock": "deployed copy has local changes",
  "deployed-unverifiable": "deployed copy predates content tracking",
  "local-diverged-from-tag": "local copy diverged from its tag",
  "no-published-tag": "no published tag contains it",
  "auth-required": "GitHub authentication is missing or expired",
  "deploy-failed": "the deploy could not be completed",
  "deployed-unsupported-package-type":
    "apm recorded a type Maestro cannot manage as a skill",
  "deploy-recorded-invalid": "apm recorded the deployment as invalid",
  "deploy-unverified": "apm's install could not be confirmed from the lockfile",
};

// The bulk route returns codes, not prose, so the one recovery step a row can
// act on lives here — the same guidance the single-deploy message carries.
const recoverySteps: Partial<Record<DeploySkillError, string>> = {
  "deployed-unsupported-package-type":
    "Fix the skill in the Harness, release a new version, then deploy again.",
  "deploy-recorded-invalid":
    "Add a SKILL.md in the Harness, release a new version, then deploy again.",
  "deploy-unverified":
    "Check the deployment record (apm.lock.yaml) on the target, then deploy again.",
};

function errorLabel(error: DeploySkillError): string {
  return errorLabels[error] ?? error;
}

function RecoveryStep({ error }: { error: DeploySkillError }) {
  const step = recoverySteps[error];
  return step ? <span className="text-dim">{step}</span> : null;
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
  // Distinct message, never the counts summary — zeroed counts would look
  // like a clean success (#292).
  if (view.tone === "error") {
    return (
      <div className="mx-card-x mb-row-y">
        <div
          role="status"
          aria-live="polite"
          aria-label="Bulk deploy result"
          className="rounded-control border border-line bg-inset px-card-x py-row-y font-mono text-amber-ink text-mono-sm"
        >
          Deploy to {view.targetLabel} failed: {view.message}
        </div>
      </div>
    );
  }

  const summary = isDeploying
    ? "Deploying…"
    : bulkDeploySummary({
        targetLabel: view.targetLabel,
        counts: view.counts,
      });

  return (
    <div className="mx-card-x mb-row-y">
      {/* Off-screen live region announces the result without moving focus. */}
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
          className={cn(
            "cursor-pointer font-mono text-mono-sm",
            HOVER_TRANSITION,
            view.tone === "success"
              ? "text-green-ink hover:text-green-hover"
              : "text-amber-ink hover:text-amber-hover",
          )}
        >
          {summary}
        </summary>

        {/* Bounded with its own scrollbar so bottom failures stay reachable.
            Focusable: an unfocusable scroll region is keyboard-unreachable
            (WCAG 2.1.1). Below 1200px uncapped — the page scrolls instead. */}
        <section
          aria-label="Bulk deploy result detail"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: see above — a scroll container has to be focusable to be keyboard-reachable
          tabIndex={0}
          className="mt-row-y flex flex-col gap-row-y overflow-y-auto min-[1200px]:max-h-[30cqh] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
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
                      {row.packageType ? ` (${row.packageType})` : ""}
                    </span>
                    <RecoveryStep error={row.error} />
                  </span>
                  {onForce && row.forceable ? (
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
                  <RecoveryStep error={row.error} />
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
        </section>
      </details>
    </div>
  );
}
