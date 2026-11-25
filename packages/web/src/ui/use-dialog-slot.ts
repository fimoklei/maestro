import { useState } from "react";

export type DialogSlotState<Name extends string> = {
  standing: Name | null;
  open: (name: Name) => void;
  close: () => void;
};

export function useDialogSlot<Name extends string>(): DialogSlotState<Name> {
  const [standing, setStanding] = useState<Name | null>(null);
  return { standing, open: setStanding, close: () => setStanding(null) };
}
