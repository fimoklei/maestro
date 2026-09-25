// The Harness name, release and skill count, shared by sidebar and narrow bar.
import { useHarness } from "../harness/use-harness";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { targetLabel } from "./target-label";

// Each fact has its own read (#841): `undefined` is "not read yet"; `null` is
// a read that found no release.
export function harnessMetaLine(
  release: string | null | undefined,
  skillCount: number | undefined,
): string | null {
  const parts: string[] = [];
  if (release !== undefined) {
    // Short on purpose: the line has one 16px row inside a 244px sidebar, and
    // a longer wording truncates mid-word beside the skill count.
    parts.push(release === null ? "No release" : release);
  }
  if (skillCount !== undefined) {
    parts.push(`${skillCount} ${skillCount === 1 ? "skill" : "skills"}`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

export interface HarnessSummary {
  /** The configured Harness path, or null while none is connected. */
  path: string | null;
  /** The shortened, identifying label for that path (#211). */
  label: string;
  meta: string | null;
}

export function useHarnessSummary(): HarnessSummary {
  const config = useInventoryConfig();
  const path = config.data?.inventoryPath ?? null;
  // Gated on a connected Harness: both reads answer 409 until one is set.
  const connected = path !== null;
  const harness = useHarness({ enabled: connected });
  const inventory = useInventory({ enabled: connected });

  return {
    path,
    label: path === null ? "No Harness connected" : targetLabel(path),
    meta: harnessMetaLine(
      harness.isSuccess ? harness.data.releasedVersion : undefined,
      inventory.isSuccess ? inventory.data.primitives.length : undefined,
    ),
  };
}
