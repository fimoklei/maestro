import type { HarnessCategories } from "@maestro/core";
import {
  HARNESS_CATEGORIES,
  harnessCategoriesCount,
  harnessCategoriesFaulty,
} from "../categories/categories-copy";
import { Notice } from "../ui/notice";
import { SettingsSection } from "./settings-section";

// What the latest Harness release holds of the Harness categories. A Harness
// without them, or one that could not be read, shows nothing.
export function HarnessCategoriesSection({
  harness,
}: {
  harness: HarnessCategories | undefined;
}) {
  if (harness?.kind === "listed") {
    return (
      <SettingsSection
        title={HARNESS_CATEGORIES}
        description={harnessCategoriesCount(harness.count)}
      />
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
