import type { GitHubPage } from "@maestro/core";
import { useQueryClient } from "@tanstack/react-query";
import { useHarness } from "../harness/use-harness";
import { INVENTORY_NOT_READ } from "../inventory/inventory-copy";
import { refreshInventoryReads } from "../inventory/use-connect-inventory";
import { useInventory, useInventoryConfig } from "../inventory/use-inventory";
import { targetLabel } from "../shell/target-label";
import { harnessMetaLine } from "../shell/use-harness-summary";
import { ACTIONS, doneSentence } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { rereadLabel } from "../ui/control-labels";
import { NOT_READ_YET } from "../ui/freshness";
import { Notice } from "../ui/notice";
import { plainText } from "../ui/phrase";
import { ScreenStatusRegion, useScreenStatus } from "../ui/screen-status";
import { Skeleton } from "../ui/skeleton";
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

export function HarnessLocationPage() {
  const queryClient = useQueryClient();
  const config = useInventoryConfig();
  const path = config.data?.inventoryPath ?? null;
  const connected = path !== null;
  const inventory = useInventory({ enabled: connected });
  const harness = useHarness({ enabled: connected });
  const reading =
    config.isFetching || inventory.isFetching || harness.isFetching;
  const dialog = useSetLocationDialog({
    onSet: (stored) =>
      status.report(
        plainText(doneSentence("setLocation", targetLabel(stored))),
      ),
  });

  const reread = () => {
    status.press();
    // The release on the Latest release line is the Harness read's.
    refreshInventoryReads(queryClient, { connectedPath: null, harness: true });
  };

  // Only the Inventory read is stated as a failure: a failed Harness read
  // leaves the release off the Latest release line. The notice names Re-read
  // Inventory rather than carrying it, as the control sits beside the facts.
  const readNotice = inventory.isError ? INVENTORY_NOT_READ : null;
  // A write's done sentence, until the next read.
  const status = useScreenStatus({
    name: SCREEN,
    reading,
    notice: readNotice,
    busy: dialog.busy ? ACTIONS.setLocation.busy : null,
  });
  const meta = harnessMetaLine(
    harness.isSuccess ? harness.data.releasedVersion : undefined,
    inventory.data?.primitives.length,
  );
  const release = meta === null ? NOT_READ_YET : plainText(meta);
  const github = config.data?.githubRepository ?? null;

  const fact = (
    name: string,
    value: string,
    machine = true,
    github?: GitHubPage,
  ) =>
    status.skeleton ? (
      <SettingsRow name={name} control={<Skeleton className="w-40" />} />
    ) : (
      <SettingsRow
        name={name}
        value={value}
        machine={machine}
        github={github}
      />
    );

  return (
    <SettingsPanel title={SCREEN}>
      <ScreenStatusRegion status={status} />
      {/* Mounted before a failure is, so it is announced (#465). */}
      <Notice trigger="load" notice={readNotice} />
      <SettingsSection
        title={CONNECTED_HARNESS}
        busy={reading}
        action={
          <Button variant="quiet" onClick={reread}>
            {rereadLabel("Inventory")}
          </Button>
        }
      >
        {fact(LOCAL_CLONE, path ?? NOT_READ_YET, path !== null)}
        {github === null
          ? fact(GITHUB_REPOSITORY, GITHUB_NOT_READ, false)
          : fact(GITHUB_REPOSITORY, github, true, config.data?.github)}
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
