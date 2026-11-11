import type { CategoryList } from "@maestro/core";
import { useState } from "react";
import { notRenamed } from "../categories/categories-copy";
import {
  categoryEditFailure,
  categoryNameError,
  refusedForName,
} from "../categories/category-refusals";
import { useRenameCategory } from "../categories/use-categories";
import { named, phrase } from "../ui/phrase";
import { useWriteAction } from "../ui/use-write-action";
import { RenameCategoryDialog } from "./rename-category-dialog";

type Category = CategoryList["categories"][number];

// Rename category, mounted only while its dialog stands. A rename stays in
// view, so its row says it.
export function RenameCategoryAction({
  category,
  list,
  report,
  onRenamed,
  onClose,
}: {
  category: Category;
  list: CategoryList | undefined;
  /** The page's one status region. */
  report: (write: string) => void;
  /** Selects the renamed row under its new name. */
  onRenamed: (name: string) => void;
  onClose: () => void;
}) {
  const renameMutation = useRenameCategory();
  const [name, setName] = useState(category.name);
  const [submitted, setSubmitted] = useState(false);
  const rename = useWriteAction(renameMutation, {
    report,
    show: "region",
    action: "rename",
    subject: (_list, { to }) => ({
      name: phrase`${named(to.trim())}`,
      row: to.trim(),
    }),
    failure: (error) =>
      refusedForName(error) ? null : categoryEditFailure(error, notRenamed),
  });

  const runRename = () => {
    setSubmitted(true);
    renameMutation.reset();
    if (categoryNameError(name, list, null, category.name) !== undefined) {
      return;
    }
    rename.run(
      { from: category.name, to: name },
      {
        onSuccess: (_list, { to }) => {
          onClose();
          onRenamed(to.trim());
        },
      },
    );
  };

  return (
    <RenameCategoryDialog
      category={category}
      name={name}
      onNameChange={(next) => {
        setName(next);
        renameMutation.reset();
      }}
      error={
        submitted
          ? categoryNameError(name, list, renameMutation.error, category.name)
          : undefined
      }
      failure={rename.failure}
      busy={rename.phase === "running"}
      onRename={runRename}
      onClose={() => {
        if (rename.phase !== "running") onClose();
      }}
    />
  );
}
