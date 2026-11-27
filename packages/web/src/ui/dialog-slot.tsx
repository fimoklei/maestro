import { Fragment, type ReactNode } from "react";

export function DialogSlot<Name extends string>({
  standing,
  dialogs,
}: {
  standing: Name | null;
  dialogs: Record<Name, () => ReactNode>;
}) {
  return standing === null ? null : (
    <Fragment key={standing}>{dialogs[standing]()}</Fragment>
  );
}
