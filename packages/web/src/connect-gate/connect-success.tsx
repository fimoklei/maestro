import { useState } from "react";
import { HARNESS_CATEGORIES } from "../categories/categories-copy";
import { refusalCode } from "../categories/category-refusals";
import {
  useCopyHarnessCategories,
  useHarnessCategoriesOffer,
} from "../categories/use-categories";
import type { ConnectResponse } from "../inventory/use-connect-inventory";
import type { NoticeContent } from "../ui/notice";
import { useWriteAction } from "../ui/use-write-action";
import { connectCopyFailed } from "./connect-gate-copy";
import { ConnectSuccessView } from "./connect-success-view";

// The gate has no status region: its button carries the busy label, and the
// copy's result shows on the screen it moves to.
const NO_REGION = () => {};

// The success beat of a connect. Mounting it offers the Harness categories,
// which records them as seen; continue copies them while the box is checked,
// with Add, which keeps any list the operator already has. The operator moves
// on either way: a failed copy is handed to the next screen.
export function ConnectSuccess({
  result,
  onContinue,
}: {
  result: ConnectResponse;
  /** `copyFailed`: why the copy did not land; null where it did or none ran. */
  onContinue: (copyFailed: NoticeContent | null) => void;
}) {
  const offer = useHarnessCategoriesOffer();
  const copy = useWriteAction(useCopyHarnessCategories(), {
    report: NO_REGION,
    show: "toast",
    action: "copy",
    subject: () => ({ name: HARNESS_CATEGORIES, row: null }),
    failure: () => null,
  });
  const [checked, setChecked] = useState(true);
  const offered = offer.data?.kind === "listed";

  return (
    <ConnectSuccessView
      outcome={result.outcome}
      primitiveCount={result.primitiveCount}
      inventoryPath={result.inventoryPath}
      copyOffer={offered ? { checked, onCheckedChange: setChecked } : null}
      copying={copy.phase === "running"}
      onContinue={() => {
        if (!(offered && checked)) {
          onContinue(null);
          return;
        }
        copy.run("add", {
          onSuccess: () => onContinue(null),
          onError: (error) => onContinue(connectCopyFailed(refusalCode(error))),
        });
      }}
    />
  );
}
