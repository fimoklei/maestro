import { useQueryClient } from "@tanstack/react-query";
import { HARNESS_QUERIES, useHarness } from "../harness/use-harness";
import {
  INVENTORY_NOT_READ,
  NOT_READ_YET,
  REREAD_LABEL,
} from "../inventory/inventory-copy";
import {
  INVENTORY_CONFIG_KEY,
  INVENTORY_KEY,
  useInventory,
  useInventoryConfig,
} from "../inventory/use-inventory";
import { targetLabel } from "../shell/target-label";
import { harnessMetaLine } from "../shell/use-harness-summary";
import { ACTIONS, doneSentence } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { Skeleton } from "../ui/skeleton";
import { useReadAnnouncement } from "../ui/use-read-announcement";
import { useReadSkeleton } from "../ui/use-read-skeleton";
import { useStatusRegion } from "../ui/use-status-region";
import { SetLocationDialog } from "./set-location-dialog";
import {
  CHANGE_LOCATION,
  CHANGE_LOCATION_SENTENCE,
  CONNECTED_HARNESS,
  GITHUB_NOT_READ,
  GITHUB_REPOSITORY,
  LATEST_RELEASE,
  LOCAL_CLONE,
  LOCATION,
} from "./settings-copy";
import { HARNESS_LOCATION_PAGE } from "./settings-pages";
import { SettingsPanel } from "./settings-panel";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";
import { useSetLocationDialog } from "./use-set-location-dialog";

const SCREEN = HARNESS_LOCATION_PAGE.label;

// The Settings page for the connected Harness (#995): what Maestro reads from,
// Re-read Inventory beside those facts, and the one control that re-points it.
export function HarnessLocationPage() {
  const queryClient = useQueryClient();
  const config = useInventoryConfig();
  const path = config.data?.inventoryPath ?? null;
  const connected = path !== null;
  const inventory = useInventory({ enabled: connected });
  const harness = useHarness({ enabled: connected });
  const reading =
    config.isFetching || inventory.isFetching || harness.isFetching;
  const skeleton = useReadSkeleton(reading);
  const dialog = useSetLocationDialog({
    onSet: (stored) =>
      setWrite(doneSentence("setLocation", targetLabel(stored))),
  });

  const reread = () => {
    skeleton.press();
    setWrite("");
    void queryClient.invalidateQueries({ queryKey: INVENTORY_KEY });
    void queryClient.invalidateQueries({ queryKey: INVENTORY_CONFIG_KEY });
    // The release on the Latest release line is the Harness read's.
    void queryClient.invalidateQueries({ queryKey: HARNESS_QUERIES });
  };

  // Only the Inventory read is stated as a failure: a failed Harness read
  // leaves the release off the Latest release line. The notice names Re-read
  // Inventory rather than carrying it, as the control sits beside the facts.
  const readNotice = inventory.isError ? INVENTORY_NOT_READ : null;
  // A write's done sentence, until the next read (design.md → Keyboard).
  const [region, setWrite] = useStatusRegion(
    useReadAnnouncement(SCREEN, skeleton.visible, readNotice),
  );
  const release =
    harnessMetaLine(
      harness.isSuccess ? harness.data.releasedVersion : undefined,
      inventory.data?.primitives.length,
    ) ?? NOT_READ_YET;
  const github = config.data?.githubRepository ?? null;

  // Placeholder bars while a read runs, then the facts it read.
  const fact = (name: string, value: string, machine = true) =>
    skeleton.visible ? (
      <SettingsRow name={name} control={<Skeleton className="w-40" />} />
    ) : (
      <SettingsRow name={name} value={value} machine={machine} />
    );

  return (
    <SettingsPanel title={SCREEN}>
      <div role="status" className="sr-only">
        {dialog.busy ? ACTIONS.setLocation.busy : region}
      </div>
      {/* Mounted before a failure is, so it is announced (#465). */}
      <Notice trigger="load" notice={readNotice} />
      <SettingsSection
        title={CONNECTED_HARNESS}
        busy={reading}
        action={
          <Button variant="quiet" onClick={reread}>
            {REREAD_LABEL}
          </Button>
        }
      >
        {fact(LOCAL_CLONE, path ?? NOT_READ_YET, path !== null)}
        {fact(GITHUB_REPOSITORY, github ?? GITHUB_NOT_READ, github !== null)}
        {fact(LATEST_RELEASE, release)}
      </SettingsSection>
      <SettingsSection title={LOCATION}>
        <SettingsRow
          name={CHANGE_LOCATION}
          description={CHANGE_LOCATION_SENTENCE}
          control={
            <Button
              variant="quiet"
              onClick={() => dialog.openDialog(path ?? "")}
            >
              {CHANGE_LOCATION}
            </Button>
          }
        />
      </SettingsSection>
      {dialog.open ? <SetLocationDialog {...dialog.dialogProps} /> : null}
    </SettingsPanel>
  );
}
