import { useEffect, useRef, useState } from "react";
import { useAddCategory } from "./use-categories";

/** An add owned by the form, not the menu: its name lands even once the menu is gone. */
export type HeldCategoryAdd = {
  /** Adds the typed name: the name as stored once the form holds it, else null. */
  run: (typed: string) => Promise<string | null>;
  pending: boolean;
  failed: boolean;
  reset: () => void;
};

/**
 * Adds a category from a form's menu and hands the stored name to `onAdded`.
 * A press elsewhere closes the menu mid-add; the name still reaches the form.
 */
export function useHeldCategoryAdd(
  onAdded: (name: string) => void,
): HeldCategoryAdd {
  const add = useAddCategory();
  return {
    run: (typed) =>
      add.mutateAsync(typed).then(
        ({ added }) => {
          onAdded(added);
          return added;
        },
        () => null,
      ),
    pending: add.isPending,
    failed: add.isError,
    reset: add.reset,
  };
}

/**
 * A form's submit that waits for its category add: a press while the add
 * runs submits once it lands, from the form as it then stands; a refused add
 * cancels the submit and stays stated beside the field.
 */
export function useSubmitAfterAdd(add: HeldCategoryAdd, submit: () => void) {
  const [queued, setQueued] = useState(false);
  const latest = useRef(submit);
  useEffect(() => {
    latest.current = submit;
  });
  useEffect(() => {
    if (!queued || add.pending) return;
    setQueued(false);
    if (!add.failed) latest.current();
  }, [queued, add.pending, add.failed]);
  return {
    /** A submit waits for the add: the action shows its spinner meanwhile. */
    waiting: queued,
    submit: () => {
      if (add.pending) setQueued(true);
      else submit();
    },
  };
}
