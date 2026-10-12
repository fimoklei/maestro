// The Harness name and release, shared by sidebar and narrow bar.
import { useHarness } from "../harness/use-harness";
import { useInventoryConfig } from "../inventory/use-inventory";
import { NOT_RELEASED_YET } from "../ui/band-copy";
import { machine, type Phrase, phrase } from "../ui/phrase";
import { harnessName } from "./target-name";

// `undefined` is "not read yet"; `null` is a read that found no release (#841).
export function harnessMetaLine(
  release: string | null | undefined,
): Phrase | null {
  if (release === undefined) return null;
  return release === null
    ? phrase`${NOT_RELEASED_YET}`
    : phrase`${machine(release)}`;
}

interface HarnessSummary {
  /** The configured Harness path, or null while none is connected. */
  path: string | null;
  /** The shortened, identifying label for that path (#211). */
  label: string;
  /** The release, set apart as a machine value. */
  meta: Phrase | null;
}

export function useHarnessSummary(): HarnessSummary {
  const config = useInventoryConfig();
  const path = config.data?.inventoryPath ?? null;
  // Gated on a connected Harness: the read answers 409 until one is set.
  const harness = useHarness({ enabled: path !== null });

  return {
    path,
    label: path === null ? "No Harness connected" : harnessName(path),
    meta: harnessMetaLine(
      harness.isSuccess ? harness.data.releasedVersion : undefined,
    ),
  };
}
