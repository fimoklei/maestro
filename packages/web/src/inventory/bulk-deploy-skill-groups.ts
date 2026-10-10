import type { GroupedListGroup } from "../ui/grouped-list";
import {
  toDeployLegend,
  UP_TO_DATE_NOTE,
  upToDateLegend,
} from "./inventory-copy";
import type { BulkDeployPlan } from "./plan-bulk-deploy";

const rows = (names: readonly string[]) =>
  names.map((name) => ({ key: name, name }));

// What the dialog lists: the staged skills alone until a plan exists, then
// what the deploy sends and what it leaves as it is. The title already counts
// the staged skills, so the first list needs no legend.
export function bulkDeploySkillGroups(
  stagedNames: readonly string[],
  plan: BulkDeployPlan | null,
): GroupedListGroup[] {
  if (plan === null) {
    return [
      {
        tone: "neutral",
        legend: null,
        rows: rows(stagedNames),
      },
    ];
  }
  return [
    {
      tone: "neutral",
      legend: toDeployLegend(plan.toDeploy.length),
      rows: rows(plan.toDeploy),
    },
    {
      tone: "neutral",
      legend: upToDateLegend(plan.skippedClean.length),
      note: UP_TO_DATE_NOTE,
      rows: rows(plan.skippedClean),
    },
  ];
}
