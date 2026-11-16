import { useState } from "react";
import { categoryNotice } from "../categories/category-refusals";
import {
  useCopyHarnessCategories,
  useHarnessCategoriesOffer,
} from "../categories/use-categories";
import type { ConnectResponse } from "../inventory/use-connect-inventory";
import { connectCopyFailed } from "./connect-gate-copy";
import { ConnectSuccessView } from "./connect-success-view";

// The success beat of a connect. Mounting it offers the Harness categories,
// which records them as seen; continue copies them while the box is checked,
// with Add, which keeps any list the operator already has.
export function ConnectSuccess({
  result,
  onContinue,
}: {
  result: ConnectResponse;
  onContinue: () => void;
}) {
  const offer = useHarnessCategoriesOffer();
  const copy = useCopyHarnessCategories();
  const [checked, setChecked] = useState(true);
  const offered = offer.data?.kind === "listed";

  return (
    <ConnectSuccessView
      outcome={result.outcome}
      primitiveCount={result.primitiveCount}
      inventoryPath={result.inventoryPath}
      copyOffer={
        offered
          ? {
              checked,
              onCheckedChange: (next) => {
                setChecked(next);
                copy.reset();
              },
            }
          : null
      }
      copying={copy.isPending}
      failure={categoryNotice(copy.error, connectCopyFailed)}
      onContinue={() => {
        if (offered && checked) {
          copy.mutate("add", { onSuccess: onContinue });
        } else {
          onContinue();
        }
      }}
    />
  );
}
