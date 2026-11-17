import type { HarnessCategories } from "@maestro/core";
import type { ReactNode } from "react";
import {
  COPY_FROM_HARNESS,
  COPY_HARNESS_CATEGORIES,
  COPY_ROW_SENTENCE,
  HARNESS_CATEGORIES,
  harnessCategoriesChanged,
  harnessCategoriesCount,
  harnessCategoriesFaulty,
} from "../categories/categories-copy";
import { Button } from "../ui/button";
import { Notice } from "../ui/notice";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

// What the latest Harness release holds of the Harness categories, the copy
// of them where it holds some, then the pull-request row. A release without
// categories, or one that could not be read, states nothing.
export function HarnessCategoriesSection({
  harness,
  onCopy,
  children,
}: {
  harness: HarnessCategories | undefined;
  onCopy: () => void;
  /** The rows after Copy, such as Propose to Harness. */
  children: ReactNode;
}) {
  return (
    <SettingsSection
      title={HARNESS_CATEGORIES}
      description={
        harness?.kind === "listed"
          ? harnessCategoriesCount(harness.count)
          : undefined
      }
      notice={
        harness?.kind === "faulty" ? (
          <Notice
            trigger="load"
            notice={harnessCategoriesFaulty(harness.tag)}
          />
        ) : harness?.kind === "listed" && harness.changed ? (
          <Notice
            trigger="load"
            notice={harnessCategoriesChanged(harness.tag)}
          />
        ) : undefined
      }
    >
      {harness?.kind === "listed" ? (
        <SettingsRow
          name={COPY_HARNESS_CATEGORIES}
          description={COPY_ROW_SENTENCE}
          control={
            <Button variant="quiet" onClick={onCopy}>
              {COPY_FROM_HARNESS}
            </Button>
          }
        />
      ) : null}
      {children}
    </SettingsSection>
  );
}
