import { useRef } from "react";
import type { DriftViewModel } from "../drift/drift-view-model";
import { Card } from "../ui/card";
import { Notice } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { DeployStateList } from "./deploy-state-list";
import { toolDeployedView, withOtherOrigins } from "./deployed-view";
import { joinNames } from "./join-names";
import { PinnedPerSkillHead } from "./pinned-per-skill-head";
import { releaseLabel } from "./release-head-copy";
import { ReleaseHeadMeta } from "./release-head-meta";
import {
  skippedEntryKey,
  skippedEntryText,
  skippedNeedsAttention,
} from "./skipped-entry-text";
import { TargetDeployAction } from "./target-deploy-action";
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
  otherOrigins = [],
  drift,
  onStartDeploy,
}: {
  isLoading: boolean;
  isError: boolean;
  tools: ToolDeployState[];
  skipped: SkippedEntry[];
  // Repos named on a lockfile entry no detected tool's prefix covers (#655).
  otherOrigins?: string[];
  drift: DriftViewModel;
  onStartDeploy: () => void;
}) {
  return (
    <section>
      {/* A count, like every other section's meta — an unread section states
          none, since zero detected is a finding, not a blank. */}
      <SectionHeader
        level={3}
        title="Global targets"
        meta={isLoading || isError ? undefined : `${tools.length} detected`}
      />
      {isLoading ? (
        <p className="text-dim text-tag">Loading the global targets…</p>
      ) : isError ? (
        <Notice
          trigger="load"
          notice={{
            level: "error",
            label: "Global targets not read",
            message: "Reload the page to read the global targets again.",
          }}
        />
      ) : tools.length === 0 ? (
        <Notice
          trigger="load"
          notice={{
            level: "info",
            label: "No supported tool detected",
            message: "Install Claude Code or Codex to deploy skills globally.",
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {tools.map((group) => (
            <ToolTargetCard
              key={group.tool}
              group={group}
              drift={drift}
              // Section-wide, since a skipped entry names no tool (#358).
              attentionCount={skipped.filter(skippedNeedsAttention).length}
              // Section-wide too: an unattributed entry names no tool either (#655).
              otherOrigins={otherOrigins}
              // A removal triggered from one card covers every detected tool (#338).
              detectedTools={tools.map((detected) => detected.tool)}
              onStartDeploy={onStartDeploy}
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
  attentionCount,
  otherOrigins,
  onStartDeploy,
}: {
  group: ToolDeployState;
  drift: DriftViewModel;
  detectedTools: string[];
  attentionCount: number;
  otherOrigins: string[];
  onStartDeploy: () => void;
}) {
  const { label, destination } = toolPresentation(group.tool);
  // Where focus goes when a removal destroys the row it was triggered from.
  const headerRef = useRef<HTMLHeadingElement>(null);
  const names = group.primitives.map((primitive) => primitive.name);
  // Narrowed to this tool's skills, so a skill behind elsewhere doesn't leak in.
  const toolDrift = drift.forTool(names);
  // Nothing this card can attribute — but the lockfile still names a repo, so
  // this reads as "holds a foreign origin", never as "empty" (#655).
  const indicator = withOtherOrigins(
    toolDrift.targetIndicator(
      toolDeployedView(names, undefined, attentionCount),
    ),
    otherOrigins,
  );

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
      data={group.releaseHead ? releaseLabel(group.releaseHead) : undefined}
      drift={indicator === "drift"}
      status={
        <TargetStatusChip
          indicator={indicator}
          pinnedPerSkill={group.pinnedPerSkill !== undefined}
        />
      }
    >
      {indicator === "foreign" ? (
        // Foreign is empty plus a fact, so the fact stands above the same
        // action an empty target offers, never instead of it (#749).
        <>
          <p className="px-card-x pt-row-y text-dim text-tag">
            Holds primitives deployed from {joinNames(otherOrigins)}.
          </p>
          <TargetDeployAction onStartDeploy={onStartDeploy} />
        </>
      ) : indicator === "empty" ? (
        <TargetDeployAction onStartDeploy={onStartDeploy} />
      ) : (
        <>
          {group.releaseHead ? (
            <ReleaseHeadMeta head={group.releaseHead} />
          ) : null}
          {group.pinnedPerSkill ? (
            <PinnedPerSkillHead pinned={group.pinnedPerSkill} />
          ) : null}
          <DeployStateList
            primitives={group.primitives}
            skipped={[]}
            drift={toolDrift}
            headRelease={group.releaseHead?.release}
            extraFiles={group.extraFiles}
            target={{ kind: "global", tools: detectedTools }}
            onRemoved={() => headerRef.current?.focus()}
          />
        </>
      )}
    </Card>
  );
}

// Skipped entries carry no known deployed subtree, so they surface once per
// section rather than duplicated on every card.
function SkippedNotice({ skipped }: { skipped: SkippedEntry[] }) {
  return (
    <ul className="mt-3 space-y-1 text-tag">
      {skipped.map((entry, index) => (
        <li
          key={skippedEntryKey(entry, index)}
          className={
            skippedNeedsAttention(entry) ? "text-amber-ink" : "text-dim"
          }
        >
          {skippedEntryText(entry)}
        </li>
      ))}
    </ul>
  );
}
