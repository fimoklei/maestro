import type { HarnessCategories } from "@maestro/core";
import {
  COPY,
  COPY_HARNESS_CATEGORIES,
  COPY_ROW_SENTENCE,
  HARNESS_CATEGORIES,
  harnessCategoriesCount,
  harnessCategoriesFaulty,
} from "../categories/categories-copy";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

// What the latest Harness release holds of the Harness categories, and the
// copy of them. A Harness without them, or one that could not be read, shows
// nothing.
export function HarnessCategoriesSection({
  harness,
  onCopy,
}: {
  harness: HarnessCategories | undefined;
  onCopy: () => void;
}) {
  if (harness?.kind === "listed") {
    return (
      <SettingsSection
        title={HARNESS_CATEGORIES}
        description={harnessCategoriesCount(harness.count)}
      >
        <SettingsRow
          name={COPY_HARNESS_CATEGORIES}
          description={COPY_ROW_SENTENCE}
          control={
            <Button
              variant="quiet"
              aria-label={COPY_HARNESS_CATEGORIES}
              onClick={onCopy}
            >
              {COPY}
            </Button>
          }
        />
      </SettingsSection>
    );
  }
  if (harness?.kind === "faulty") {
    return (
      <SettingsSection
        title={HARNESS_CATEGORIES}
        notice={
          <Notice
            trigger="load"
            notice={harnessCategoriesFaulty(harness.tag)}
          />
        }
      />
    );
  }
  return null;
}
