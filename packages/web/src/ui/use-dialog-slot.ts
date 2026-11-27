import { useState } from "react";

export type Payloads = Record<string, unknown>;

type Standing<P extends Payloads> = {
  [Name in keyof P]: { name: Name; payload: P[Name] };
}[keyof P];

type PayloadArgument<Payload> = undefined extends Payload
  ? [payload?: Payload]
  : [payload: Payload];

export type DialogSlotState<P extends Payloads> = {
  standing: Standing<P> | null;
  open: <Name extends keyof P>(
    name: Name,
    ...payload: PayloadArgument<P[Name]>
  ) => void;
  openUnlessStanding: <Name extends keyof P>(
    name: Name,
    ...payload: PayloadArgument<P[Name]>
  ) => void;
  close: (name: keyof P) => void;
  payloadOf: <Name extends keyof P>(name: Name) => P[Name] | null;
};

export function useDialogSlot<P extends Payloads>(): DialogSlotState<P> {
  const [standing, setStanding] = useState<Standing<P> | null>(null);
  return {
    standing,
    open: (name, ...[payload]) => setStanding({ name, payload } as Standing<P>),
    openUnlessStanding: (name, ...[payload]) =>
      setStanding((current) => current ?? ({ name, payload } as Standing<P>)),
    close: (name) =>
      setStanding((current) => (current?.name === name ? null : current)),
    payloadOf: <Name extends keyof P>(name: Name) =>
      standing?.name === name ? (standing.payload as P[Name]) : null,
  };
}
