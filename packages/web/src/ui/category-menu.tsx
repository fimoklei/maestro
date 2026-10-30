import {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNameProblem,
  sameCategoryName,
  trimCategoryName,
} from "@maestro/core/category-name";
import { Plus } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import {
  ADD_CATEGORY,
  NO_CATEGORY,
  SEARCH_CATEGORIES,
} from "./category-menu-copy";
import { cn } from "./cn";
import { HOVER_TRANSITION } from "./hover-transition";
import { Icon } from "./icon";
import { Notice, type NoticeContent } from "./notice";

/** A press leaves focus where it landed; Escape and a pick return it. */
export type MenuClosedBy = "escape" | "press" | "picked";

type Option =
  | { kind: "none" }
  | { kind: "name"; name: string }
  | { kind: "add"; typed: string };

const keyOf = (option: Option) =>
  option.kind === "none"
    ? "none"
    : option.kind === "add"
      ? "add"
      : ["name", option.name].join(":");

/** The options for what is typed: No category, the names containing it, then Add. */
function optionsFor(
  names: readonly string[],
  exclude: string | undefined,
  query: string,
): Option[] {
  const typed = trimCategoryName(query);
  const listed = names.filter(
    (name) => exclude === undefined || !sameCategoryName(name, exclude),
  );
  const matching = listed.filter((name) =>
    name.toLowerCase().includes(typed.toLowerCase()),
  );
  const taken = names.some((name) => sameCategoryName(name, typed));
  return [
    { kind: "none" },
    ...matching.map((name) => ({ kind: "name" as const, name })),
    ...(categoryNameProblem(typed) !== null || taken
      ? []
      : [{ kind: "add" as const, typed }]),
  ];
}

// Typed text leads to Add; otherwise the menu starts on the current category.
function firstActive(
  options: readonly Option[],
  current: string | null | undefined,
  query: string,
): number {
  if (trimCategoryName(query) !== "") {
    const add = options.findIndex((option) => option.kind === "add");
    return add === -1 ? Math.min(1, options.length - 1) : add;
  }
  const at = options.findIndex((option) => isCurrent(option, current));
  return at === -1 ? 0 : at;
}

const isCurrent = (option: Option, current: string | null | undefined) =>
  current === undefined
    ? false
    : option.kind === "none"
      ? current === null
      : option.kind === "name" &&
        current !== null &&
        sameCategoryName(option.name, current);

const itemClasses = cn(
  "flex h-control shrink-0 cursor-pointer items-center gap-inline rounded-control px-inline font-ui text-gray-12 text-row",
  HOVER_TRANSITION,
  "hover:bg-gray-3 data-[active]:bg-gray-3",
);

/**
 * Picks one category: a search box, No category, the categories containing the
 * typed text, and Add category for a new name. Renders only; the caller places it.
 */
export function CategoryMenu({
  label,
  names,
  current,
  exclude,
  initialQuery = "",
  failure = null,
  onPick,
  onAdd,
  onClose,
}: {
  /** The menu's accessible name, such as `Set category for tdd`. */
  label: string;
  names: readonly string[];
  /** Marked ✓: null for No category; undefined marks nothing, as for rows that differ. */
  current: string | null | undefined;
  /** A category the reader may not pick, such as the one being deleted. */
  exclude?: string;
  /** What the search box opens holding, such as a name the imported file gave. */
  initialQuery?: string;
  /** Why the last pick or add did not land. */
  failure?: NoticeContent | null;
  onPick: (name: string | null) => void;
  /** The trimmed name, which matches no category. */
  onAdd: (typed: string) => void;
  /** Escape, or a press outside the menu and the control that opened it. */
  onClose: (via: MenuClosedBy) => void;
}) {
  const listId = useId();
  const optionId = useId();
  const [query, setQuery] = useState(initialQuery);
  const options = optionsFor(names, exclude, query);
  const [active, setActive] = useState(() =>
    firstActive(options, current, query),
  );
  const container = useRef<HTMLFieldSetElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const shown = Math.min(active, options.length - 1);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // The opener toggles the menu itself, so a press on it is not outside.
    const opener =
      document.activeElement === document.body ? null : document.activeElement;
    field.current?.focus();
    const onPress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (container.current?.contains(target) || opener?.contains(target)) {
        return;
      }
      onCloseRef.current("press");
    };
    document.addEventListener("pointerdown", onPress, true);
    return () => document.removeEventListener("pointerdown", onPress, true);
  }, []);

  useEffect(() => {
    document
      .getElementById(`${optionId}-${shown}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [optionId, shown]);

  const choose = (option: Option) => {
    if (option.kind === "add") onAdd(option.typed);
    else onPick(option.kind === "none" ? null : option.name);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      setActive((shown + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = options[shown];
      if (option !== undefined) choose(option);
      return;
    }
    if (event.key === "Escape") {
      // The menu's own: the pane or dialog behind it stays open.
      event.preventDefault();
      event.stopPropagation();
      onClose("escape");
    }
  };

  return (
    <fieldset
      ref={container}
      aria-label={label}
      className="m-0 flex max-h-full min-h-0 min-w-0 flex-col rounded-float border border-gray-7 bg-gray-2 p-tight shadow-float"
    >
      <input
        ref={field}
        type="text"
        role="combobox"
        aria-label={SEARCH_CATEGORIES}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={`${optionId}-${shown}`}
        placeholder={SEARCH_CATEGORIES}
        maxLength={CATEGORY_NAME_MAX_LENGTH}
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setActive(
            firstActive(optionsFor(names, exclude, next), current, next),
          );
        }}
        onKeyDown={onKeyDown}
        className="mb-tight h-control shrink-0 w-full rounded-control border border-gray-9 bg-gray-1 px-inline font-ui text-gray-12 text-row placeholder:text-gray-11 focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:-outline-offset-1"
      />
      {failure === null ? null : (
        <div className="mb-tight shrink-0">
          <Notice trigger="user-action" notice={failure} />
        </div>
      )}
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        // A long list scrolls inside the menu, never past the panel.
        className="flex max-h-64 min-h-0 flex-col overflow-y-auto"
      >
        {options.map((option, index) => {
          const selected = isCurrent(option, current);
          const divided =
            index > 0 &&
            (option.kind === "add" || options[index - 1]?.kind === "none");
          return (
            <Fragment key={keyOf(option)}>
              {divided ? (
                <div
                  aria-hidden="true"
                  className="-mx-tight my-tight h-px shrink-0 bg-gray-6"
                />
              ) : null}
              {/* biome-ignore lint/a11y/useFocusableInteractive: the search box holds focus and points at the active option with aria-activedescendant */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the search box takes the keys for every option */}
              <div
                id={`${optionId}-${index}`}
                role="option"
                aria-selected={selected}
                data-active={index === shown ? "" : undefined}
                // Keeps focus in the search box.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(option)}
                className={itemClasses}
              >
                <span
                  aria-hidden="true"
                  className="grid w-4 place-items-center"
                >
                  {option.kind === "add" ? (
                    <Icon of={Plus} />
                  ) : selected ? (
                    "✓"
                  ) : null}
                </span>
                {option.kind === "none" ? (
                  NO_CATEGORY
                ) : option.kind === "name" ? (
                  option.name
                ) : (
                  <span className="truncate">
                    {ADD_CATEGORY}{" "}
                    <span className="font-medium">{option.typed}</span>
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </fieldset>
  );
}
