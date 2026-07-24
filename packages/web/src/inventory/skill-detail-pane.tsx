import type { ReactNode } from "react";
import type { DriftStatus } from "../drift/drift-view-model";
import { versionColor } from "../drift/version-color";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { TypeTag } from "../ui/type-tag";
import type { SkillDeployment } from "./skill-deployments";
import type { Primitive } from "./use-inventory";

// The inventory's detail pane: the "do" surface to the table's "see" (ADR-0016).
// Selecting a row opens it; it names the skill, lists where the skill is deployed
// with the version at each target (the per-primitive lens on the same cached
// deploy-state, #290), and hosts the deploy control moved out of the row.
//
// Presentational: the "deployed to" rows arrive already folded (skill-deployments.ts),
// and the live deploy control is injected as `deployAction` so the pane carries no
// hooks and stays storyable (frontend.md).
export function SkillDetailPane({
  primitive,
  deployments,
  unconfirmed,
  deployAction,
  onClose,
}: {
  primitive: Primitive;
  deployments: SkillDeployment[];
  // True while any target's deploy-state read is still pending or unreadable, so
  // the reach is not yet known. An empty list is then "not known yet", not a
  // confirmed "deployed nowhere" — the J04 honesty the deployed cell keeps.
  unconfirmed: boolean;
  deployAction: ReactNode;
  onClose: () => void;
}) {
  const paneId = `skill-detail-${primitive.name}`;

  return (
    <aside
      id={paneId}
      aria-label={`${primitive.name} detail`}
      className="flex w-80 flex-none flex-col border-line border-l bg-inset"
    >
      <div className="flex items-center border-line-faint border-b px-card-x py-row-y">
        <span className="text-dim text-tag uppercase tracking-tag">Skill</span>
        <button
          type="button"
          aria-label="Close detail pane"
          onClick={onClose}
          className="ml-auto grid size-6 place-items-center rounded-control border border-line-chip text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="border-line-faint border-b px-card-x py-row-y">
        <div className="flex items-center gap-2">
          <TypeTag type={primitive.type} />
          <h2 className="font-medium text-fg text-lg">{primitive.name}</h2>
        </div>
        <p className="mt-2 text-desc text-muted">{primitive.description}</p>
      </div>

      <div className="border-line-faint border-b px-card-x py-row-y">
        <div className="mb-2 text-dim text-tag uppercase tracking-tag">
          Deployed to
        </div>
        {deployments.length > 0 ? (
          <>
            <ul>
              {deployments.map((deployment) => (
                <DeployedRow key={deployment.label} deployment={deployment} />
              ))}
            </ul>
            {/* Some targets loaded, others are still pending or unreadable — the
                listed set is partial, so never let it read as the full reach
                (J04). */}
            {unconfirmed ? (
              <p className="mt-2 text-desc text-dim">
                more targets may still be loading…
              </p>
            ) : null}
          </>
        ) : unconfirmed ? (
          // The reach is not yet known — never claim a definite absence while a
          // read is still in flight or failed (J04).
          <p className="text-desc text-dim">still reading deploy state…</p>
        ) : (
          <p className="text-desc text-dim">not deployed to any target yet</p>
        )}
      </div>

      <div className="mt-auto border-line-row border-t px-card-x py-row-y">
        <div className="mb-2 text-dim text-tag uppercase tracking-tag">
          Deploy
        </div>
        {deployAction}
      </div>
    </aside>
  );
}

const driftChip: Partial<
  Record<DriftStatus, { tone: "drift" | "dim"; label: string }>
> = {
  behind: { tone: "drift", label: "behind" },
  unknown: { tone: "dim", label: "unknown" },
  unverified: { tone: "dim", label: "unverified" },
};

function DeployedRow({ deployment }: { deployment: SkillDeployment }) {
  const { label, version, status, latest } = deployment;
  const chip = driftChip[status];
  return (
    <li className="flex items-center gap-2 py-1 text-tag">
      {/* Status dot pairs colour with a glyph and text so in-sync/drift survive
          without colour perception (PRODUCT.md). Drift states carry the word in
          their chip; in-sync has no chip, so it holds an sr-only word here. */}
      <span
        aria-hidden="true"
        className={cn("text-[9px]", versionColor[status])}
      >
        ●
      </span>
      {status === "up-to-date" ? (
        <span className="sr-only">in sync</span>
      ) : null}
      <span className="flex-1 truncate text-fg-2">{label}</span>
      <span className={cn("font-mono", versionColor[status])}>
        {status === "behind" && latest ? `${version} → ${latest}` : version}
      </span>
      {chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
    </li>
  );
}
