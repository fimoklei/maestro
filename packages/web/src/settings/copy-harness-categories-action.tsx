import type { CopyMode } from "@maestro/core";
import { useState } from "react";
import {
  copyFailed,
  copyPreviewFailed,
  HARNESS_CATEGORIES,
} from "../categories/categories-copy";
import { categoryNotice } from "../categories/category-refusals";
import {
  useCopyHarnessCategories,
  useCopyPreview,
} from "../categories/use-categories";
import { useWriteAction } from "../ui/use-write-action";
import { CopyHarnessCategoriesDialog } from "./copy-harness-categories-dialog";

// Copy Harness categories, mounted only while its dialog stands. The copied
// rows show in the list on the same page, so the region says it.
export function CopyHarnessCategoriesAction({
  report,
  onClose,
}: {
  /** The page's one status region. */
  report: (write: string) => void;
  onClose: () => void;
}) {
  const preview = useCopyPreview();
  const [mode, setMode] = useState<CopyMode>("add");
  const copy = useWriteAction(useCopyHarnessCategories(), {
    report,
    show: "region",
    action: "copy",
    subject: () => ({ name: HARNESS_CATEGORIES, row: null }),
    failure: (error) => categoryNotice(error, copyFailed),
  });
  const running = copy.phase === "running";

  return (
    <CopyHarnessCategoriesDialog
      preview={preview.data ?? null}
      mode={mode}
      onModeChange={setMode}
      failure={
        preview.isError
          ? categoryNotice(preview.error, copyPreviewFailed)
          : copy.failure
      }
      busy={running}
      onCopy={() => copy.run(mode, { onSuccess: onClose })}
      onClose={() => {
        if (!running) onClose();
      }}
    />
  );
}
