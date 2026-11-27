import { useState } from "react";

export type DialogSlotState<Name extends string> = {
  standing: Name | null;
  open: (name: Name) => void;
  close: (name: Name) => void;
};

export function useDialogSlot<Name extends string>(): DialogSlotState<Name> {
  const [standing, setStanding] = useState<Name | null>(null);
  return {
    standing,
    open: setStanding,
    close: (name) =>
      setStanding((current) => (current === name ? null : current)),
  };
}
