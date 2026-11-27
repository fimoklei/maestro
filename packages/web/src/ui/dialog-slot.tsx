import { Fragment, type ReactNode } from "react";
import type { DialogSlotState, Payloads } from "./use-dialog-slot";

export function DialogSlot<P extends Payloads>({
  slot: { standing },
  dialogs,
}: {
  slot: DialogSlotState<P>;
  dialogs: NoInfer<{ [Name in keyof P]: (payload: P[Name]) => ReactNode }>;
}) {
  return standing === null ? null : (
    <Fragment key={String(standing.name)}>
      {dialogs[standing.name](standing.payload)}
    </Fragment>
  );
}
