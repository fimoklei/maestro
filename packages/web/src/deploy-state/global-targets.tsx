import { useRef } from "react";
import type { DriftViewModel } from "../drift/drift-view-model";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { DeployStateList } from "./deploy-state-list";
import { toolDeployedView } from "./deployed-view";
import { skippedEntryKey, skippedEntryText } from "./skipped-entry-text";
import { TargetStatusChip } from "./target-status-chip";
import { toolPresentation } from "./tool-presentation";
import type { SkippedEntry } from "./use-deploy-state";
import type { ToolDeployState } from "./use-global-deploy-state";

// Presentational "GLOBAL TARGETS" section: one Card per detected tool
// (ADR-0011). An empty tools list is the honest zero-detected state (an
// install hint), never conflated with a read failure (J03).
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
        meta="supported coding assistants"
      />
      {isLoading ? (
        <p className="text-dim text-tag">Loading…</p>
      ) : isError ? (
        <p role="alert" className="text-amber-ink text-tag">
          Could not read the global deploy-state.
        </p>
      ) : tools.length === 0 ? (
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
              // A removal triggered from one card covers every detected tool (#338).
              detectedTools={tools.map((detected) => detected.tool)}
            />
          ))}
        </div>
      )}
      {/* Section-wide, not per-tool: never dropped even with no tool detected (J03). */}
      {!isLoading && !isError && skipped.length > 0 ? (
        <SkippedNotice skipped={skipped} />
      ) : null}
    </section>
  );
}

function ToolTargetCard({
  group,
  drift,
  detectedTools,
}: {
  group: ToolDeployState;
  drift: DriftViewModel;
  detectedTools: string[];
}) {
  const { label, destination } = toolPresentation(group.tool);
  // Where focus goes when a removal destroys the row it was triggered from.
  const headerRef = useRef<HTMLHeadingElement>(null);
  const names = group.primitives.map((primitive) => primitive.name);
  // Narrowed to this tool's skills, so a skill behind elsewhere doesn't leak in.
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
        target={{ kind: "global", tools: detectedTools }}
        onRemoved={() => headerRef.current?.focus()}
      />
    </Card>
  );
}

// Skipped entries carry no known deployed subtree, so they surface once per
// section rather than duplicated on every card.
function SkippedNotice({ skipped }: { skipped: SkippedEntry[] }) {
  return (
    <ul className="mt-3 text-dim text-tag">
      {skipped.map((entry, index) => (
        <li key={skippedEntryKey(entry, index)}>{skippedEntryText(entry)}</li>
      ))}
    </ul>
  );
}
