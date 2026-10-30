import type { CategoryList } from "@maestro/core";
import {
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "@maestro/core/category-name";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "../api/http";
import {
  ADD_CATEGORY,
  CATEGORIES_READ_FAILED,
  CATEGORIES_SENTENCE,
  CATEGORY_NAME_ERRORS,
  CATEGORY_NOT_ADDED,
  CATEGORY_NOT_CONFIGURED,
  categoriesUnreadable,
  categoryCounts,
  NO_CATEGORIES,
  NO_CATEGORIES_SENTENCE,
  nameExistsError,
  REREAD_CATEGORIES,
} from "../categories/categories-copy";
import { useAddCategory, useCategories } from "../categories/use-categories";
import { ACTIONS, doneSentence } from "../ui/busy-copy";
import { EmptyState } from "../ui/empty-state";
import { GatedButton } from "../ui/gated-button";
import { Notice, type NoticeContent } from "../ui/notice";
import { plainText } from "../ui/phrase";
import { ScreenStatusRegion, useScreenStatus } from "../ui/screen-status";
import { AddCategoryDialog } from "./add-category-dialog";
import { CATEGORIES_PAGE } from "./settings-pages";
import { SettingsPanel } from "./settings-panel";
import { SettingsRow } from "./settings-row";
import { SettingsSection } from "./settings-section";

const SCREEN = CATEGORIES_PAGE.label;

type Refusal = { error?: string; existing?: string; configPath?: string };

const refusalOf = (error: unknown): Refusal | null =>
  error instanceof HttpError && typeof error.body === "object"
    ? (error.body as Refusal | null)
    : null;

// A refusal the page or the dialog states as a notice; a name refusal is the field's.
function noticeFor(
  error: unknown,
  fallback: NoticeContent,
): NoticeContent | null {
  if (!error) return null;
  const refusal = refusalOf(error);
  if (refusal?.error === "not-configured") {
    return CATEGORY_NOT_CONFIGURED;
  }
  if (
    refusal?.error === "categories-unreadable" &&
    typeof refusal.configPath === "string"
  ) {
    return categoriesUnreadable(refusal.configPath);
  }
  return fallback;
}

// The field's own line for a name the rules, the list or the server refuse.
function nameError(
  name: string,
  list: CategoryList | undefined,
  refused: unknown,
): string | undefined {
  const trimmed = trimCategoryName(name);
  const problem = categoryNameProblem(trimmed);
  if (problem !== null) return CATEGORY_NAME_ERRORS[problem];
  const existing = list?.categories.find((each) =>
    sameCategoryName(each.name, trimmed),
  )?.name;
  if (existing !== undefined) return nameExistsError(existing);
  const refusal = refusalOf(refused);
  if (refusal?.error === "name-exists" && refusal.existing !== undefined) {
    return nameExistsError(refusal.existing);
  }
  return undefined;
}

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

  const readNotice = noticeFor(categories.error, {
    level: "error",
    ...CATEGORIES_READ_FAILED,
    action: {
      label: REREAD_CATEGORIES,
      onClick: () => void categories.refetch(),
    },
  });
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

  const fieldError = submitted
    ? nameError(name, categories.data, add.error)
    : undefined;
  const addRefusal = refusalOf(add.error)?.error;
  const dialogFailure =
    add.isError && addRefusal !== "name-exists" && addRefusal !== "name-invalid"
      ? noticeFor(add.error, { level: "error", ...CATEGORY_NOT_ADDED })
      : null;

  const runAdd = () => {
    setSubmitted(true);
    add.reset();
    if (nameError(name, categories.data, null) !== undefined) return;
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
    <SettingsPanel title={SCREEN}>
      <ScreenStatusRegion status={status} />
      {/* Mounted before a failure is, so it is announced (#465). */}
      <Notice trigger="load" notice={readNotice} />
      <SettingsSection
        title={SCREEN}
        description={CATEGORIES_SENTENCE}
        list={list.length > 0}
        busy={categories.isFetching}
        action={
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
        }
      >
        {categories.isSuccess && list.length === 0 ? (
          <EmptyState
            title={NO_CATEGORIES}
            description={NO_CATEGORIES_SENTENCE}
            headingLevel={3}
          />
        ) : (
          list.map((category) => (
            <SettingsRow
              key={category.name}
              name={category.name}
              value={categoryCounts(category.skills, category.prompts)}
              machine={false}
              listItem
              selected={category.name === selected}
              rowRef={category.name === selected ? selectedRef : undefined}
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
    </SettingsPanel>
  );
}
