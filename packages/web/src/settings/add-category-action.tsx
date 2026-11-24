import type { CategoryList } from "@maestro/core";
import { useState } from "react";
import { CATEGORY_NOT_ADDED } from "../categories/categories-copy";
import {
  categoryNameError,
  categoryNotice,
  refusedForName,
} from "../categories/category-refusals";
import { useAddCategory } from "../categories/use-categories";
import { named, phrase } from "../ui/phrase";
import { useWriteAction } from "../ui/use-write-action";
import { AddCategoryDialog } from "./add-category-dialog";

export function AddCategoryAction({
  list,
  report,
  onAdded,
  onClose,
}: {
  list: CategoryList | undefined;
  report: (write: string) => void;
  onAdded: (name: string) => void;
  onClose: () => void;
}) {
  const addMutation = useAddCategory();
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const add = useWriteAction(addMutation, {
    report,
    show: "region",
    action: "add",
    subject: ({ added }) => ({ name: phrase`${named(added)}`, row: added }),
    failure: (error) =>
      refusedForName(error)
        ? null
        : categoryNotice(error, () => ({
            level: "error",
            ...CATEGORY_NOT_ADDED,
          })),
  });
  const running = add.phase === "running";

  const runAdd = () => {
    setSubmitted(true);
    addMutation.reset();
    if (categoryNameError(name, list, null, null) !== undefined) return;
    add.run(name, {
      onSuccess: ({ added }) => {
        onClose();
        onAdded(added);
      },
    });
  };

  return (
    <AddCategoryDialog
      name={name}
      onNameChange={(next) => {
        setName(next);
        addMutation.reset();
      }}
      error={
        submitted
          ? categoryNameError(name, list, addMutation.error, null)
          : undefined
      }
      failure={add.failure}
      busy={running}
      onAdd={runAdd}
      onClose={() => {
        if (!running) onClose();
      }}
    />
  );
}
