import type { HarnessCategories } from "@maestro/core";
import type { ReactNode } from "react";
import {
  HARNESS_CATEGORIES,
  harnessCategoriesCount,
  harnessCategoriesFaulty,
} from "../categories/categories-copy";
import { Notice } from "../ui/notice";
import { SettingsSection } from "./settings-section";

// What the latest Harness release holds of the Harness categories, then the
// rows that act on them. A release that could not be read states nothing.
export function HarnessCategoriesSection({
  harness,
  children,
}: {
  harness: HarnessCategories | undefined;
  /** The section's rows, such as Pull request to the Harness. */
  children: ReactNode;
}) {
  return (
    <SettingsSection
      title={HARNESS_CATEGORIES}
      description={
        harness?.kind === "listed"
          ? harnessCategoriesCount(harness.count)
          : harness?.kind === "none"
            ? harnessCategoriesCount(0)
            : undefined
      }
      notice={
        harness?.kind === "faulty" ? (
          <Notice
            trigger="load"
            notice={harnessCategoriesFaulty(harness.tag)}
          />
        ) : undefined
      }
    >
      {children}
    </SettingsSection>
  );
}
