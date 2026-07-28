import { useRef } from "react";
import type { DriftViewModel } from "../drift/drift-view-model";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { DeployStateList } from "./deploy-state-list";
import { toolDeployedView } from "./deployed-view";
import { TargetStatusChip } from "./target-status-chip";
import { toolPresentation } from "./tool-presentation";
import type { SkippedEntry } from "./use-deploy-state";
import type { ToolDeployState } from "./use-global-deploy-state";

// Presentational "GLOBAL TARGETS" section: one Card per detected tool (ADR-0011).
// Fed entirely through props so it carries no hooks — the container owns the
// TanStack Query state and passes it here (frontend.md), which also keeps this
// storyable. The section label always renders (it is the baseline); only the
// body switches on the read state. An empty tools list is the honest
// zero-tools-detected state (an install hint, never a blank), a read failure is
// a visible error, and an empty list must never stand in for either (J03).
export function GlobalTargets({
  isLoading,
  isError,
  tools,
  skipped,
  drift,
}: {
  isLoading: boolean;
  isError: boolean;
  tools: ToolDeployState[];
  skipped: SkippedEntry[];
  drift: DriftViewModel;
}) {
  return (
    <section>
      <SectionHeader
        level={3}
        title="Global targets"
        meta="the tools on this machine"
      />
      {isLoading ? (
        <p className="text-dim text-tag">Loading…</p>
      ) : isError ? (
        <p role="alert" className="text-amber-ink text-tag">
          Could not read the global deploy-state.
        </p>
      ) : tools.length === 0 ? (
        // No supported tool on this machine: nudge an install rather than show
        // empty cards for tools that are not there (ADR-0011).
        <p role="status" className="text-dim text-tag">
          Install Claude Code or Codex to deploy skills globally.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {tools.map((group) => (
            <ToolTargetCard
              key={group.tool}
              group={group}
              drift={drift}
              // Every card knows the whole detected set: a removal triggered in
              // one card covers all of them (#338).
              detectedTools={tools.map((detected) => detected.tool)}
            />
          ))}
        </div>
      )}
      {/* Skipped entries are section-wide (not attributed to any tool), so they
          surface once below the body in every read state that has them — never
          dropped, even when no tool is detected (J03). Loading/error carry no
          skipped set, so this stays quiet there. */}
      {!isLoading && !isError && skipped.length > 0 ? (
        <SkippedNotice skipped={skipped} />
      ) : null}
    </section>
  );
}

// One detected tool's card: the tool name as headline, its destination path as a
// secondary detail, and its own deployed primitives with per-skill drift. The
// single global drift check is filtered to this tool's skills, so a skill behind
// on another tool never surfaces here as a spurious "also behind" (the drift
// mechanism itself is unchanged — ADR-0005/0007).
function ToolTargetCard({
  group,
  drift,
  detectedTools,
}: {
  group: ToolDeployState;
  drift: DriftViewModel;
  // The whole detected set, not just this card's tool: a global removal
  // triggered here covers every one of them, and the confirmation says so.
  detectedTools: string[];
}) {
  const { label, destination } = toolPresentation(group.tool);
  // Where focus goes when a removal destroys the row it was triggered from.
  const headerRef = useRef<HTMLHeadingElement>(null);
  const names = group.primitives.map((primitive) => primitive.name);
  // The single global drift check is narrowed to this tool's skills, so a skill
  // behind on another tool never surfaces here as a spurious "also behind".
  const toolDrift = drift.forTool(names);
  const indicator = toolDrift.targetIndicator(toolDeployedView(names));

  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span>{label}</span>
          {destination ? (
            <span className="font-normal text-dim text-tag normal-case">
              {destination}
            </span>
          ) : null}
        </span>
      }
      titleRef={headerRef}
      kind="global"
      drift={indicator === "drift"}
      status={<TargetStatusChip indicator={indicator} />}
    >
      <DeployStateList
        primitives={group.primitives}
        skipped={[]}
        drift={toolDrift}
        target={{ kind: "global" }}
        detectedTools={detectedTools}
        onRemoved={() => headerRef.current?.focus()}
      />
    </Card>
  );
}

// Lockfile entries of an unsupported package_type are not attributed to any tool
// (they carry no known deployed subtree), so they are surfaced once for the whole
// section rather than duplicated on every card — never silently dropped.
function SkippedNotice({ skipped }: { skipped: SkippedEntry[] }) {
  return (
    <ul className="mt-3 text-dim text-tag">
      {skipped.map((entry) => (
        <li key={entry.virtualPath}>
          Skipped {entry.virtualPath} (unsupported type {entry.packageType}).
        </li>
      ))}
    </ul>
  );
}
