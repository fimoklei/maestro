import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ADD_CATEGORY,
  CATEGORIES_READ_FAILED,
  CATEGORIES_SENTENCE,
  CATEGORY_NOT_ADDED,
  NO_CATEGORIES,
  NO_CATEGORIES_SENTENCE,
  REREAD_CATEGORIES,
} from "../categories/categories-copy";
import { CategoryCountLinks } from "../categories/category-count-links";
import {
  categoryNameError,
  categoryNotice,
  refusedForName,
} from "../categories/category-refusals";
import { useAddCategory, useCategories } from "../categories/use-categories";
import { ACTIONS, doneSentence } from "../ui/busy-copy";
import { EmptyState } from "../ui/empty-state";
import { GatedButton } from "../ui/gated-button";
import { Icon } from "../ui/icon";
import { IconButton } from "../ui/icon-button";
import { Notice } from "../ui/notice";
import { plainText } from "../ui/phrase";
import { RowMenu } from "../ui/row-menu";
import { rowActionsLabel } from "../ui/row-menu-copy";
import { ScreenFocusContext } from "../ui/screen-focus";
import { ScreenStatusRegion, useScreenStatus } from "../ui/screen-status";
import { AddCategoryDialog } from "./add-category-dialog";
import { CATEGORIES_PAGE } from "./settings-pages";
import { SettingsPanel } from "./settings-panel";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";
import { useCategoryEdits } from "./use-category-edits";

const SCREEN = CATEGORIES_PAGE.label;

// Settings › Categories (#1719): the operator's own list for the connected
// Harness, alphabetical, each with its counts.
export function CategoriesPage() {
  const categories = useCategories();
  const add = useAddCategory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedRef = useRef<HTMLLIElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const rereadRef = useRef<HTMLButtonElement>(null);

  // The notice names Re-read Categories rather than carrying it, as the
  // control sits beside Add category.
  const readNotice = categoryNotice(categories.error, () => ({
    level: "error",
    ...CATEGORIES_READ_FAILED,
  }));
  const status = useScreenStatus({
    name: SCREEN,
    reading: categories.isFetching,
    notice: readNotice,
    busy: add.isPending ? ACTIONS.add.busy : null,
  });

  // After an add, focus lands on the new row: a frame later, once the closing
  // dialog has handed focus back.
  useEffect(() => {
    if (selected === null) return;
    const frame = requestAnimationFrame(() => selectedRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [selected]);

  const edits = useCategoryEdits({
    list: categories.data,
    report: status.report,
    onRenamed: setSelected,
  });

  // A delete takes its row and the ⋮ that opened it: focus goes to the row
  // now in its place, else to Re-read Categories.
  const deletedAt = useRef(0);
  const refocus = () => {
    const menus =
      pageRef.current?.querySelectorAll<HTMLElement>(
        "li button[aria-haspopup]",
      ) ?? [];
    const stood = menus[deletedAt.current] ?? menus[menus.length - 1];
    (stood ?? rereadRef.current)?.focus();
  };

  const fieldError = submitted
    ? categoryNameError(name, categories.data, add.error, null)
    : undefined;
  const dialogFailure =
    add.isError && !refusedForName(add.error)
      ? categoryNotice(add.error, () => ({
          level: "error",
          ...CATEGORY_NOT_ADDED,
        }))
      : null;

  const runAdd = () => {
    setSubmitted(true);
    add.reset();
    if (categoryNameError(name, categories.data, null, null) !== undefined) {
      return;
    }
    add.mutate(name, {
      onSuccess: ({ added }) => {
        setOpen(false);
        setSelected(added);
        status.report(plainText(doneSentence("add", added)));
      },
    });
  };

  const list = categories.data?.categories ?? [];

  return (
    <ScreenFocusContext.Provider value={refocus}>
      <SettingsPanel title={SCREEN}>
        <div ref={pageRef} className="contents">
          <ScreenStatusRegion status={status} />
          {/* Mounted before a failure is, so it is announced (#465). */}
          <Notice trigger="load" notice={readNotice} />
          <SettingsSection
            title={SCREEN}
            description={CATEGORIES_SENTENCE}
            list={list.length > 0}
            busy={categories.isFetching}
            action={
              <>
                <IconButton
                  ref={rereadRef}
                  label={REREAD_CATEGORIES}
                  busy={categories.isFetching}
                  onClick={() => {
                    status.press();
                    void categories.refetch();
                  }}
                >
                  <Icon of={RefreshCw} />
                </IconButton>
                <GatedButton
                  label={ADD_CATEGORY}
                  unavailable={
                    categories.isSuccess ? null : (readNotice?.label ?? null)
                  }
                  onClick={() => {
                    setName("");
                    setSubmitted(false);
                    add.reset();
                    setOpen(true);
                  }}
                />
              </>
            }
          >
            {categories.isSuccess && list.length === 0 ? (
              <EmptyState
                title={NO_CATEGORIES}
                description={NO_CATEGORIES_SENTENCE}
                headingLevel={3}
              />
            ) : (
              list.map((category, index) => (
                <SettingsRow
                  key={category.name}
                  name={category.name}
                  listItem
                  selected={category.name === selected}
                  rowRef={category.name === selected ? selectedRef : undefined}
                  control={
                    <>
                      <CategoryCountLinks
                        name={category.name}
                        skills={category.skills}
                        prompts={category.prompts}
                      />
                      <RowMenu
                        label={rowActionsLabel(category.name)}
                        tabStop
                        busy={false}
                        items={edits.items(category).map((item) => ({
                          ...item,
                          onSelect: () => {
                            deletedAt.current = index;
                            item.onSelect?.();
                          },
                        }))}
                      />
                    </>
                  }
                />
              ))
            )}
          </SettingsSection>
          {open ? (
            <AddCategoryDialog
              name={name}
              onNameChange={(next) => {
                setName(next);
                add.reset();
              }}
              error={fieldError}
              failure={dialogFailure}
              busy={add.isPending}
              onAdd={runAdd}
              onClose={() => {
                if (!add.isPending) setOpen(false);
              }}
            />
          ) : null}
          {edits.dialog}
        </div>
      </SettingsPanel>
    </ScreenFocusContext.Provider>
  );
}
