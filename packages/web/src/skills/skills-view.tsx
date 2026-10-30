import type { CategoryList, InventorySkill } from "@maestro/core";
import { Puzzle, Table2, Tag } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { categoryView } from "../categories/category-view";
import { SetCategoryBarAction } from "../categories/set-category-bar-action";
import { SetCategoryMenu } from "../categories/set-category-menu";
import { LOCAL_EDITS } from "../deploy-state/target-status";
import {
  hiddenStagedCount,
  setStagedMany,
  toggleStaged,
} from "../inventory/bulk-selection";
import {
  type CloneReading,
  deleteItem,
  inClone,
} from "../inventory/clone-reading";
import {
  type DeploymentTarget,
  rollUpDeployment,
} from "../inventory/deployed-rollup";
import {
  type SkillDeployment,
  skillDeployments,
  skillReadAge,
} from "../inventory/skill-deployments";
import {
  BEHIND,
  NOT_DEPLOYED,
  SKILL_CHIPS,
  skillStatus,
  UNKNOWN,
  UP_TO_DATE,
} from "../inventory/skill-status";
import { filterByName } from "../inventory/type-filter";
import type { RegisteredRepo } from "../registry/use-registry";
import type { ActionsMenuItem } from "../ui/actions-menu";
import {
  NOT_RELEASED_YET,
  ORIGIN_FACT,
  RELEASE_FACT,
  UNKNOWN_FACT_VALUE,
} from "../ui/band-copy";
import { Button } from "../ui/button";
import type { MenuClosedBy } from "../ui/category-menu";
import {
  DELETE_SKILL,
  DEPLOY_SKILL,
  rereadLabel,
  SET_CATEGORY,
  UPDATE_TARGET,
  VIEW_DEPLOY_STATE,
} from "../ui/control-labels";
import { type Reading, readFreshness } from "../ui/freshness";
import { GitHubMark } from "../ui/github-mark-link";
import { Icon } from "../ui/icon";
import { SelectionBar } from "../ui/selection-bar";
import { TableScreen } from "../ui/table-screen";
import { useNow } from "../ui/use-now";
import { type ReadFailure, useTableScreen } from "../ui/use-table-screen";
import { useViewOptions } from "../ui/use-view-options";
import type { WriteResult } from "../ui/use-write-action";
import { BulkDeployAction } from "./bulk-deploy-action";
import { bulkRemoveTargets } from "./bulk-remove-targets";
import { SkillDetailPane } from "./skill-detail-pane";
import { type PaneDialog, SkillPaneDialog } from "./skill-pane-dialogs";
import {
  COUNTS_BELOW_REM,
  type HarnessFacts,
  LABELS_BELOW_REM,
  ORIGIN_DROP,
  RELEASED_DROP,
  SEARCH_ICON_BELOW_REM,
  SKILLS_DROP,
} from "./skills-band";
import {
  DISPLAY_OPTIONS,
  type RowAction,
  type SkillRow,
  skillsColumns,
} from "./skills-columns";
import {
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  REMOVE_FROM_TARGET,
  removeFromAllLabel,
  removeFromToolsLabel,
  SEARCH_LABEL,
  SELECT_ALL_LABEL,
  SKILLS_FACT,
  STAGE_COLUMN_LABEL,
  skillsFactValue,
  stageRowLabel,
} from "./skills-copy";

// Presentational; the container supplies the reads (#992, #1040).

// Set category's menu opens above the pane's foot, not as a dialog.
type Opened = PaneDialog | { kind: "category" };

// The row's ⋮ and the pane's foot open the same dialog per action (#1065).
const rowDialog = (
  action: RowAction,
  name: string,
  clone: CloneReading,
): Opened | null => {
  switch (action) {
    case "deploy":
      return { kind: "deploy" };
    case "category":
      return { kind: "category" };
    case "remove":
      return { kind: "remove-all" };
    case "delete": {
      // Offered only once the clone's read holds the folder.
      const folder = inClone(clone, name);
      return folder === null
        ? null
        : { kind: "delete", path: folder.path, localOnly: folder.localOnly };
    }
  }
};

// Worst first, as the Status sort orders them (#992).
const STATUS_WORDS = [
  LOCAL_EDITS,
  BEHIND,
  UNKNOWN,
  UP_TO_DATE,
  NOT_DEPLOYED,
].map((reading) => reading.word);

export function SkillsView({
  primitives,
  repos,
  registryReady,
  targets,
  harness,
  reads,
  failure,
  reading,
  onReread,
  onOpenHarness,
  onShowTarget,
  clone,
  onDeleted,
  assignments,
  categoryNames,
  initialCategory,
}: {
  /** Undefined until the Inventory has been read once. */
  primitives: InventorySkill[] | undefined;
  /** Each item's category; undefined while unread, which leaves Set category out. */
  assignments: CategoryList["assignments"] | undefined;
  /** The category list's names in order; undefined while unread. */
  categoryNames: readonly string[] | undefined;
  /** The category Filter starts at, from the URL; null for All. */
  initialCategory: string | null;
  repos: RegisteredRepo[];
  registryReady: boolean;
  // Every deploy target, for the per-row status and reach (#272). Empty until
  // reads resolve — the roll-up treats that as unconfirmed.
  targets: DeploymentTarget[];
  /** The connected Harness: undefined until read, null where its read failed. */
  harness: HarnessFacts | null | undefined;
  /** Every reading the skills and their Status rest on: the skills read and each target read. */
  reads: readonly Reading[];
  /** A failed read; the previous rows stay under it. */
  failure: ReadFailure | null;
  /** A read is running, shown or not. */
  reading: boolean;
  onReread: () => void;
  // Supplied by the container, so this component stays routerless and storyable.
  onOpenHarness?: () => void;
  /** Opens a target's row on Deploy-state; absent where no router is. */
  onShowTarget?: (rowId: string) => void;
  /** Gates Delete skill on each row. */
  clone: CloneReading;
  /** Step 1 of a deletion landed; the next step is on the Harness view. */
  onDeleted: (skill: string, written: WriteResult) => void;
}) {
  const screen = useTableScreen({
    name: "Skills",
    reading,
    settled: primitives !== undefined,
    failure,
    readFailed: failure !== null,
    onReread,
    openOnArrival: null,
  });
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Opened | null>(null);
  const categoryButton = useRef<HTMLButtonElement>(null);
  const closeCategory = (via: MenuClosedBy) => {
    setDialog(null);
    if (via !== "press") categoryButton.current?.focus();
  };
  // Apart from the open row, so inspecting and staging never toggle each other.
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());

  // Opening a row any other way drops a menu item's dialog.
  const state = {
    ...screen,
    open: (name: string | null) => {
      setDialog(null);
      screen.open(name);
    },
  };
  const openFromMenu = useCallback(
    (name: string, action: RowAction) => {
      screen.open(name);
      setDialog(rowDialog(action, name, clone));
    },
    [screen.open, clone],
  );
  const listHeading = useRef<HTMLHeadingElement>(null);

  const now = useNow();
  const all = primitives ?? [];
  const rows: SkillRow[] = all.map((primitive) => {
    const rollup = rollUpDeployment(primitive.name, targets);
    const status = skillStatus(rollup);
    const deployments = skillDeployments(primitive.name, targets);
    const removable = bulkRemoveTargets(primitive.name, targets).length;
    return {
      ...primitive,
      status,
      targets: status === null ? null : rollup.targetCount,
      deployments,
      unreadable: Boolean(rollup.unreadable),
      readAge: skillReadAge(primitive.name, targets, now),
      category:
        assignments === undefined
          ? undefined
          : (assignments.find(
              (each) => each.type === "skill" && each.name === primitive.name,
            )?.category ?? null),
      // The pane's foot holds these same items (#1065). The removal is offered only
      // from two targets, or it would repeat a target row's own (#422). It counts
      // what the removal covers: global is one target, whatever its tools (#1436).
      actions: [
        { action: "deploy", label: DEPLOY_SKILL },
        ...(assignments === undefined
          ? []
          : [{ action: "category" as const, label: SET_CATEGORY }]),
        ...(removable >= 2
          ? [
              {
                action: "remove" as const,
                label: removeFromAllLabel(removable),
                danger: true,
              },
            ]
          : []),
        ...deleteItem(clone, primitive.name, DELETE_SKILL),
      ],
    };
  });

  const view = useViewOptions(rows, {
    ...categoryView({
      names: categoryNames,
      of: (row) => row.category,
      rows,
      initial: initialCategory,
    }),
    status: {
      words: STATUS_WORDS,
      of: (row) => row.status?.word ?? null,
    },
    columns: DISPLAY_OPTIONS,
  });

  const columns = useMemo(
    () =>
      skillsColumns({
        onAction: (row, action) => openFromMenu(row.name, action),
      }),
    [openFromMenu],
  );

  const matched = new Set(filterByName(rows, query).map((row) => row.name));
  const searched = (row: SkillRow) => matched.has(row.name);
  const shownNames = rows
    .filter((row) => searched(row) && view.shown(row))
    .map((row) => row.name);
  const latestRelease = harness?.latestRelease;

  const targetItems = (deployment: SkillDeployment): ActionsMenuItem[] => {
    const { rowId } = deployment;
    return [
      ...(deployment.updatable
        ? [
            {
              label: UPDATE_TARGET,
              onSelect: () => setDialog({ kind: "update", deployment }),
            },
          ]
        : []),
      ...(onShowTarget === undefined || rowId === null
        ? []
        : [
            {
              label: VIEW_DEPLOY_STATE,
              onSelect: () => onShowTarget(rowId),
            },
          ]),
      {
        label:
          deployment.removeTarget.kind === "global"
            ? removeFromToolsLabel(deployment.removeTarget.tools)
            : REMOVE_FROM_TARGET,
        danger: true,
        onSelect: () => setDialog({ kind: "remove", deployment }),
      },
    ];
  };

  return (
    <TableScreen
      state={state}
      band={{
        facts: [
          ...(harness === undefined
            ? []
            : [
                {
                  label: ORIGIN_FACT,
                  icon: <GitHubMark />,
                  value: harness?.origin ?? UNKNOWN_FACT_VALUE,
                  github: harness?.github,
                  machine: harness !== null,
                  drop: ORIGIN_DROP,
                },
                {
                  label: RELEASE_FACT,
                  icon: <Icon of={Tag} />,
                  value:
                    harness === null
                      ? UNKNOWN_FACT_VALUE
                      : (harness.latestRelease ?? NOT_RELEASED_YET),
                  machine: harness?.latestRelease != null,
                  drop: RELEASED_DROP,
                },
              ]),
          ...(primitives === undefined
            ? []
            : [
                {
                  label: SKILLS_FACT,
                  icon: <Icon of={Puzzle} />,
                  value: skillsFactValue(shownNames.length, all.length),
                  machine: false,
                  drop: SKILLS_DROP,
                },
              ]),
        ],
        summary: {
          freshness: readFreshness(reads),
          healthy: UP_TO_DATE.word,
          counts: view.statusCounts(SKILL_CHIPS),
        },
        search: {
          label: SEARCH_LABEL,
          value: query,
          onChange: setQuery,
          iconBelowRem: SEARCH_ICON_BELOW_REM,
        },
        labelsBelowRem: LABELS_BELOW_REM,
        countsBelowRem: COUNTS_BELOW_REM,
      }}
      rereading={screen.reading}
      firstReadRows={24}
      rows={rows}
      columns={columns}
      rowId={(row) => row.name}
      shown={searched}
      view={view}
      noMatch={view.filterCount > 0 ? NO_FILTER_MATCH : NO_SEARCH_MATCH}
      empty={{
        ...NO_RELEASED_SKILLS,
        icon: <Icon of={Table2} />,
        action:
          onOpenHarness === undefined ? undefined : (
            <Button variant="quiet" onClick={onOpenHarness}>
              Open Harness
            </Button>
          ),
      }}
      selection={{
        label: STAGE_COLUMN_LABEL,
        allLabel: SELECT_ALL_LABEL,
        rowLabel: (row) => stageRowLabel(row.name),
        selected: staged,
        onToggle: (row) =>
          setStaged((current) => toggleStaged(current, row.name)),
        onSetSelected: (many, select) =>
          setStaged((current) =>
            setStagedMany(
              current,
              many.map((row) => row.name),
              select,
            ),
          ),
      }}
      // Rises with the first choice and leaves with the last (#992).
      selectionBar={
        staged.size > 0 ? (
          <SelectionBar
            count={staged.size}
            hiddenCount={hiddenStagedCount(staged, shownNames)}
            onClear={() => setStaged(new Set())}
          >
            <BulkDeployAction
              stagedNames={[...staged]}
              repos={repos}
              registryReady={registryReady}
              onSelectionSpent={() => setStaged(new Set())}
            />
            {assignments === undefined ? null : (
              <SetCategoryBarAction
                type="skill"
                names={[...staged]}
                reread={rereadLabel(screen.name)}
                onSelectionSpent={() => setStaged(new Set())}
              />
            )}
          </SelectionBar>
        ) : null
      }
      pane={(row, frame) => {
        const rollup = rollUpDeployment(row.name, targets);
        return (
          <>
            <SkillDetailPane
              primitive={row}
              rollup={rollup}
              latestRelease={latestRelease}
              deployments={row.deployments}
              listHeadingRef={listHeading}
              {...frame}
              // A dialog the row's ⋮ opened holds focus itself.
              initialFocus={dialog === null ? undefined : null}
              targetItems={targetItems}
              selectionActive={staged.size > 0}
              category={row.category}
              footItems={row.actions.map((item) =>
                item.action === "category"
                  ? {
                      label: item.label,
                      expanded: dialog?.kind === "category",
                      buttonRef: categoryButton,
                      onSelect: () =>
                        setDialog(
                          dialog?.kind === "category"
                            ? null
                            : { kind: "category" },
                        ),
                    }
                  : {
                      label: item.label,
                      danger: item.danger,
                      disabled: item.disabled,
                      onSelect: () =>
                        setDialog(rowDialog(item.action, row.name, clone)),
                    },
              )}
              footMenu={
                dialog?.kind === "category" ? (
                  <SetCategoryMenu
                    // Keyed by skill: paging to the next row starts afresh.
                    key={row.name}
                    items={[{ type: "skill", name: row.name }]}
                    reread={rereadLabel(screen.name)}
                    onClose={closeCategory}
                  />
                ) : null
              }
            />
            {dialog === null || dialog.kind === "category" ? null : (
              <SkillPaneDialog
                // Keyed by skill: a refusal from the previous skill can never
                // carry over and overwrite the next one (#66).
                key={row.name}
                dialog={dialog}
                skillName={row.name}
                repos={repos}
                registryReady={registryReady}
                removable={bulkRemoveTargets(row.name, targets)}
                onClose={() => setDialog(null)}
                // The row that opened it is gone, so focus goes to its list.
                onRemoved={() => {
                  setDialog(null);
                  requestAnimationFrame(() => listHeading.current?.focus());
                }}
                onDeleted={(written) => onDeleted(row.name, written)}
              />
            )}
          </>
        );
      }}
    />
  );
}
